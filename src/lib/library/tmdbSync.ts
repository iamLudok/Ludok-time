// Series y películas: añadirlas desde TMDB y mantener sus episodios al día.
import { inArray } from 'drizzle-orm'
import { getDb } from '../dbRef'
import { newId } from '../ids'
import { items as itemsTable, episodes as episodesTable } from '../schema'
import { itemToRow } from '../rows'
import { chunk } from '../sqlHelpers'
import { getMovie, getSeries, getSeasonEpisodes, posterUrl } from '../tmdb'
import type { TmdbSeason } from '../tmdb'
import type { Item, Episode, MediaType, Status } from '../../types'
import {
  getItem,
  episodesOf,
  findBySource,
  insertEpisodes,
  upsertEpisodes,
  recomputeSeriesStatus,
} from './queries'

/**
 * Igual que Promise.all, pero como máximo `limit` peticiones a la vez y sin
 * abortar si alguna falla (se reporta aparte). Series con muchísimas
 * temporadas (Los Simpson, doramas larguísimos) podían disparar decenas de
 * peticiones simultáneas a TMDB y chocar con su límite de tasa, perdiendo
 * episodios de alguna temporada sin avisar a nadie.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<{ results: R[]; failed: number }> {
  const results: R[] = []
  let failed = 0
  let index = 0
  const worker = async () => {
    while (index < items.length) {
      const i = index++
      try {
        results[i] = await fn(items[i])
      } catch {
        failed++
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  // Los índices fallidos quedan huecos: los descartamos sin perder el orden de los que sí llegaron.
  return { results: results.filter((r) => r !== undefined), failed }
}

/** Hoy en formato 'YYYY-MM-DD', que es como TMDB da las fechas de emisión. */
function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Si un episodio ya se ha emitido.
 *
 * TMDB devuelve las temporadas COMPLETAS, incluidos los capítulos que aún no han
 * salido: vienen con título y fecha futura, pero sin fotograma. Guardarlos
 * ensuciaba la lista con episodios que no existen todavía, hacía que el progreso
 * dijera 24/25 para siempre y, lo peor, desactivaba el aviso de «próximo
 * episodio», que solo aparece cuando ese capítulo NO está ya en tu lista.
 *
 * Sin fecha se da por emitido: normalmente son series antiguas a las que TMDB no
 * les puso fecha, y esconderlas sería peor. Se comparan como texto para no
 * meterse en zonas horarias: el formato 'YYYY-MM-DD' ya ordena bien.
 */
function hasAired(
  airDate: string | undefined,
  hoy = today(),
  /** Con `last` (último emitido según TMDB) se decide también para los episodios sin fecha. */
  ep?: { season: number; episode: number },
  last?: { season: number; episode: number },
): boolean {
  if (airDate) return airDate <= hoy
  // Sin fecha: si TMDB dice cuál fue el último emitido, lo que va DESPUÉS es
  // «plantilla» de una temporada ya anunciada (Episodio 2, 3… sin fecha ni foto).
  if (ep && last) {
    return ep.season < last.season || (ep.season === last.season && ep.episode <= last.episode)
  }
  return true
}

/**
 * Qué temporadas están anunciadas de verdad.
 *
 * En cuanto una serie se renueva, TMDB a veces añade ya la temporada siguiente
 * a la lista, a veces con episodios "plantilla" (Episodio 1, Episodio 2…),
 * sin foto y sin fecha. La señal fiable no es la fecha de cada episodio (de eso
 * ya se encarga `hasAired`), sino la fecha DE LA TEMPORADA: si TMDB no la
 * tiene, es que ni siquiera hay fecha de estreno decidida, y no hay nada real
 * que traer todavía: da igual que la temporada venga con 0 episodios (como
 * pasa a veces) o con diez de relleno (como con "Nadie quiere esto" T3).
 */
export function announcedSeasons(seasons: TmdbSeason[]): TmdbSeason[] {
  return seasons.filter((s) => s.airDate !== undefined)
}

/** Añade una película desde TMDB a la biblioteca. Devuelve el id local. */
export async function addMovieFromTmdb(
  tmdbId: number,
  type: MediaType = 'movie',
  status: Status = 'plan',
): Promise<string> {
  const existing = await findBySource(type, 'tmdb', String(tmdbId))
  if (existing) return existing.id

  const m = await getMovie(tmdbId)
  const item: Item = {
    id: newId(),
    type,
    source: 'tmdb',
    sourceId: String(tmdbId),
    title: m.title,
    poster: posterUrl(m.posterPath),
    overview: m.overview,
    year: m.year,
    runtime: m.runtime,
    status,
    rating: 0,
    addedAt: Date.now(),
    startedAt: status === 'completed' ? Date.now() : undefined,
    completedAt: status === 'completed' ? Date.now() : undefined,
  }
  await getDb().insert(itemsTable).values(itemToRow(item))
  return item.id
}

export interface AddSeriesResult {
  id: string
  /** Temporadas que no se pudieron cargar (fallo de red o límite de TMDB). */
  failedSeasons: number
}

/** Añade una serie desde TMDB, trayendo todos sus episodios (sin marcar). */
export async function addSeriesFromTmdb(
  tmdbId: number,
  status: Status = 'plan',
): Promise<AddSeriesResult> {
  const existing = await findBySource('series', 'tmdb', String(tmdbId))
  if (existing) return { id: existing.id, failedSeasons: 0 }

  const s = await getSeries(tmdbId)
  const itemId = newId()
  const item: Item = {
    id: itemId,
    type: 'series',
    source: 'tmdb',
    sourceId: String(tmdbId),
    title: s.title,
    poster: posterUrl(s.posterPath),
    overview: s.overview,
    year: s.year,
    runtime: s.episodeRuntime,
    status,
    rating: 0,
    addedAt: Date.now(),
  }
  await getDb().insert(itemsTable).values(itemToRow(item))

  // Como máximo 4 temporadas a la vez: series muy longevas (cientos de
  // episodios) podían disparar decenas de peticiones simultáneas y chocar
  // con el límite de tasa de TMDB, perdiendo episodios sin avisar. Las
  // temporadas sin anunciar ni se piden: no tiene sentido preguntar por los
  // episodios de una temporada que TMDB mismo dice que aún no existe.
  const { results: seasons, failed: failedSeasons } = await mapWithConcurrency(
    announcedSeasons(s.seasons),
    4,
    (season) => getSeasonEpisodes(tmdbId, season.seasonNumber),
  )
  const episodes: Episode[] = seasons
    .flat()
    .filter((e) => hasAired(e.airDate, undefined, e, s.lastEpisode))
    .map((e) => ({
    id: newId(),
    itemId,
    season: e.season,
    episode: e.episode,
    title: e.title,
    airDate: e.airDate,
    runtime: e.runtime,
    still: posterUrl(e.stillPath, 'w185'),
    watched: false,
  }))
  if (episodes.length) await insertEpisodes(episodes)
  return { id: itemId, failedSeasons }
}

export interface SyncSeriesResult {
  added: number
  failedSeasons: number
}

/**
 * Vuelve a consultar TMDB y añade los episodios nuevos que falten (series en
 * emisión). No toca los episodios ya guardados: nunca pisa su estado "visto".
 */
export async function syncSeriesEpisodes(itemId: string): Promise<SyncSeriesResult> {
  const item = await getItem(itemId)
  if (!item || item.type !== 'series' || item.source !== 'tmdb' || !item.sourceId) {
    return { added: 0, failedSeasons: 0 }
  }
  const tmdbId = Number(item.sourceId)

  const [s, existing] = await Promise.all([getSeries(tmdbId), episodesOf(itemId)])
  const have = new Set(existing.map((e) => `${e.season}-${e.episode}`))

  const { results: seasons, failed: failedSeasons } = await mapWithConcurrency(
    announcedSeasons(s.seasons),
    4,
    (season) => getSeasonEpisodes(tmdbId, season.seasonNumber),
  )
  const nuevos: Episode[] = seasons
    .flat()
    .filter((e) => hasAired(e.airDate, undefined, e, s.lastEpisode))
    .filter((e) => !have.has(`${e.season}-${e.episode}`))
    .map((e) => ({
      id: newId(),
      itemId,
      season: e.season,
      episode: e.episode,
      title: e.title,
      airDate: e.airDate,
      runtime: e.runtime,
      still: posterUrl(e.stillPath, 'w185'),
      watched: false,
    }))
  if (nuevos.length) {
    await insertEpisodes(nuevos)
    // Una serie «completada» con un episodio nuevo sin ver vuelve a «viendo»:
    // si no, no aparecería en «Continuar viendo».
    await recomputeSeriesStatus(itemId)
  }
  return { added: nuevos.length, failedSeasons }
}

/**
 * Rellena la foto (still) de episodios que ya estaban guardados de antes de
 * que existiera esta función: no toca visto/fecha de ninguno. Solo pide a
 * TMDB las temporadas que de verdad tienen algún episodio sin foto.
 */
export async function backfillEpisodeStills(itemId: string): Promise<number> {
  const item = await getItem(itemId)
  if (!item || item.type !== 'series' || item.source !== 'tmdb' || !item.sourceId) return 0

  const existing = await episodesOf(itemId)
  const missing = existing.filter((e) => !e.still)
  if (!missing.length) return 0

  const tmdbId = Number(item.sourceId)
  const seasons = [...new Set(missing.map((e) => e.season))]
  const { results } = await mapWithConcurrency(seasons, 4, (season) =>
    getSeasonEpisodes(tmdbId, season),
  )
  const stillByKey = new Map(
    results
      .flat()
      .filter((e) => e.stillPath)
      .map((e) => [`${e.season}-${e.episode}`, posterUrl(e.stillPath, 'w185')]),
  )

  const updates = missing
    .map((e) => ({ e, still: stillByKey.get(`${e.season}-${e.episode}`) }))
    .filter((x): x is { e: Episode; still: string } => !!x.still)
  if (!updates.length) return 0

  await upsertEpisodes(updates.map(({ e, still }) => ({ ...e, still })))
  return updates.length
}

/**
 * Quita los episodios que aún no se han emitido y que se guardaron antes de
 * dejar de hacerlo. Solo toca los que están SIN VER: si alguno estuviera
 * marcado, se respeta: será que la fecha de TMDB está mal, y la marca del
 * usuario manda sobre eso.
 *
 * Devuelve cuántos ha quitado. Recalcula el estado de la serie después, porque
 * al desaparecer episodios pendientes una serie puede pasar a estar completa.
 */
export async function dropUnairedEpisodes(itemId: string): Promise<number> {
  const eps = await episodesOf(itemId)
  const hoy = today()
  const sobran = eps.filter((e) => !e.watched && !hasAired(e.airDate, hoy))
  if (!sobran.length) return 0

  for (const part of chunk(sobran.map((e) => e.id))) {
    await getDb().delete(episodesTable).where(inArray(episodesTable.id, part))
  }
  await recomputeSeriesStatus(itemId)
  return sobran.length
}

/**
 * Limpieza para lo que ya se guardó ANTES de que `addSeriesFromTmdb` y
 * `syncSeriesEpisodes` dejaran de traer temporadas sin anunciar (ver
 * `announcedSeasons`). `dropUnairedEpisodes` no pillaba este caso: sus
 * episodios "plantilla" no tienen fecha, y sin fecha se daba por emitido: la
 * misma pinta que un episodio real de una serie antigua sin ese dato.
 *
 * Aquí la comprobación es distinta y necesita preguntar a TMDB: se mira la
 * lista de temporadas actual y se quita lo que tengas guardado de cualquier
 * temporada que ya no esté anunciada. Solo toca lo que está SIN VER.
 */
export async function dropUnannouncedSeasons(itemId: string): Promise<number> {
  const item = await getItem(itemId)
  if (!item || item.type !== 'series' || item.source !== 'tmdb' || !item.sourceId) return 0

  const s = await getSeries(Number(item.sourceId))
  const announced = new Set(announcedSeasons(s.seasons).map((se) => se.seasonNumber))

  const eps = await episodesOf(itemId)
  // Además de las temporadas sin anunciar: los episodios «plantilla» de una
  // temporada sí anunciada (sin fecha y posteriores al último emitido).
  const sobran = eps.filter(
    (e) =>
      !e.watched &&
      (!announced.has(e.season) || !hasAired(e.airDate, undefined, e, s.lastEpisode)),
  )
  if (!sobran.length) return 0

  for (const part of chunk(sobran.map((e) => e.id))) {
    await getDb().delete(episodesTable).where(inArray(episodesTable.id, part))
  }
  await recomputeSeriesStatus(itemId)
  return sobran.length
}
