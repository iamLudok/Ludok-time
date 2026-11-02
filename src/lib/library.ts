import { eq, and, inArray } from 'drizzle-orm'
import { getDb } from './dbRef'
import { newId } from './ids'
import { items as itemsTable, episodes as episodesTable, pastWatches as pastWatchesTable } from './schema'
import {
  rowToItem,
  rowToEpisode,
  rowToPastWatch,
  itemToRow,
  episodeToRow,
  pastWatchToRow,
} from './rows'
import { chunk, excludedSet, patchToColumns } from './sqlHelpers'
import { getMovie, getSeries, getSeasonEpisodes, posterUrl } from './tmdb'
import type { Item, Episode, MediaType, PastWatch, Status } from '../types'
import type { TmdbSeason } from './tmdb'

/**
 * Misma lógica de negocio que la versión web: lo único que cambia es cómo se
 * habla con la base de datos (Drizzle/SQLite en vez de Dexie/IndexedDB).
 *
 * Un detalle que mejora por el camino: en Dexie los campos `source` y
 * `sourceId` no estaban indexados, así que para buscar duplicados había que
 * traerse TODO y filtrar en JavaScript. Aquí son columnas de verdad y se
 * filtran en la propia consulta.
 */

/* --- Utilidades ------------------------------------------------------------ */

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
 * dijera 24/25 para siempre y —lo peor— desactivaba el aviso de «próximo
 * episodio», que solo aparece cuando ese capítulo NO está ya en tu lista.
 *
 * Sin fecha se da por emitido: normalmente son series antiguas a las que TMDB no
 * les puso fecha, y esconderlas sería peor. Se comparan como texto para no
 * meterse en zonas horarias — el formato 'YYYY-MM-DD' ya ordena bien.
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
 * a la lista — a veces con episodios "plantilla" (Episodio 1, Episodio 2…),
 * sin foto y sin fecha. La señal fiable no es la fecha de cada episodio (de eso
 * ya se encarga `hasAired`), sino la fecha DE LA TEMPORADA: si TMDB no la
 * tiene, es que ni siquiera hay fecha de estreno decidida, y no hay nada real
 * que traer todavía — da igual que la temporada venga con 0 episodios (como
 * pasa a veces) o con diez de relleno (como con "Nadie quiere esto" T3).
 */
export function announcedSeasons(seasons: TmdbSeason[]): TmdbSeason[] {
  return seasons.filter((s) => s.airDate !== undefined)
}

async function getItem(itemId: string): Promise<Item | undefined> {
  const rows = await getDb().select().from(itemsTable).where(eq(itemsTable.id, itemId)).limit(1)
  return rows[0] ? rowToItem(rows[0]) : undefined
}

async function getEpisode(episodeId: string): Promise<Episode | undefined> {
  const rows = await getDb().select().from(episodesTable).where(eq(episodesTable.id, episodeId)).limit(1)
  return rows[0] ? rowToEpisode(rows[0]) : undefined
}

async function episodesOf(itemId: string): Promise<Episode[]> {
  const rows = await getDb().select().from(episodesTable).where(eq(episodesTable.itemId, itemId))
  return rows.map(rowToEpisode)
}

/** Busca un título ya guardado por su fuente externa (evita duplicados). */
async function findBySource(
  type: MediaType,
  source: Item['source'],
  sourceId: string,
): Promise<Item | undefined> {
  const rows = await getDb()
    .select()
    .from(itemsTable)
    .where(
      and(
        eq(itemsTable.type, type),
        eq(itemsTable.source, source),
        eq(itemsTable.sourceId, sourceId),
      ),
    )
    .limit(1)
  return rows[0] ? rowToItem(rows[0]) : undefined
}

/** Si ya tienes guardado un episodio concreto de la serie. */
export async function hasEpisode(itemId: string, season: number, episode: number): Promise<boolean> {
  const eps = await episodesOf(itemId)
  return eps.some((e) => e.season === season && e.episode === episode)
}

async function insertEpisodes(eps: Episode[]): Promise<void> {
  for (const part of chunk(eps)) {
    await getDb().insert(episodesTable).values(part.map(episodeToRow))
  }
}

/** Equivalente a bulkPut: inserta o actualiza por id. */
async function upsertEpisodes(eps: Episode[]): Promise<void> {
  for (const part of chunk(eps)) {
    await getDb()
      .insert(episodesTable)
      .values(part.map(episodeToRow))
      .onConflictDoUpdate({ target: episodesTable.id, set: excludedSet(episodesTable) })
  }
}

/* --- Series y películas ---------------------------------------------------- */

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
 * que existiera esta función — no toca visto/fecha de ninguno. Solo pide a
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
 * marcado, se respeta — será que la fecha de TMDB está mal, y la marca del
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
 * episodios "plantilla" no tienen fecha, y sin fecha se daba por emitido — la
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

export function epLabel(ep: Episode): string {
  const code = `S${ep.season}E${ep.episode}`
  return ep.title ? `${code} · ${ep.title}` : code
}

/* --- Episodios ------------------------------------------------------------- */

/** Marca/desmarca un episodio y actualiza el estado de la serie. */
export async function setEpisodeWatched(episodeId: string, watched: boolean): Promise<void> {
  const ep = await getEpisode(episodeId)
  if (!ep) return
  await getDb()
    .update(episodesTable)
    .set({ watched, watchedAt: watched ? Date.now() : null })
    .where(eq(episodesTable.id, episodeId))
  await recomputeSeriesStatus(ep.itemId)
}

/**
 * Cambia (o quita, con undefined) la fecha en que marcaste visto un episodio
 * ya marcado. El episodio sigue contando como visto igualmente.
 */
export async function setEpisodeWatchedAt(
  episodeId: string,
  watchedAt: number | undefined,
): Promise<void> {
  await getDb()
    .update(episodesTable)
    .set({ watchedAt: watchedAt ?? null })
    .where(eq(episodesTable.id, episodeId))
}

/** Marca como vistos varios episodios de golpe (p. ej. "hasta aquí" o toda una temporada). */
async function markManyWatched(itemId: string, episodes: Episode[]): Promise<void> {
  const toMark = episodes.filter((e) => !e.watched)
  if (!toMark.length) return
  const now = Date.now()
  for (const part of chunk(toMark.map((e) => e.id))) {
    await getDb()
      .update(episodesTable)
      .set({ watched: true, watchedAt: now })
      .where(inArray(episodesTable.id, part))
  }
  await recomputeSeriesStatus(itemId)
}

/** Marca como vistos todos los episodios hasta (incluido) uno dado, en orden. */
export async function markWatchedUpTo(itemId: string, episodeId: string): Promise<void> {
  const eps = await orderedEpisodes(itemId)
  const idx = eps.findIndex((e) => e.id === episodeId)
  if (idx < 0) return
  await markManyWatched(itemId, eps.slice(0, idx + 1))
}

/**
 * Cuántos episodios anteriores a uno dado siguen sin ver.
 *
 * Sirve para ofrecer marcarlos también: si marcas el 12 y tienes el 1 al 11 sin
 * ver, casi siempre es que los viste y no los apuntaste, no que te hayas saltado
 * once episodios.
 */
export function countPreviousUnwatched(episodes: Episode[], episodeId: string): number {
  const idx = episodes.findIndex((e) => e.id === episodeId)
  if (idx <= 0) return 0
  return episodes.slice(0, idx).filter((e) => !e.watched).length
}

/** Deja de ofrecer «marcar anteriores» en esta serie. */
export async function stopAskingMarkPrevious(itemId: string): Promise<void> {
  await updateItem(itemId, { askMarkPrevious: false })
}

/** Marca o desmarca todos los episodios de una temporada de golpe. */
export async function setSeasonWatched(
  itemId: string,
  episodes: Episode[],
  watched: boolean,
): Promise<void> {
  if (watched) {
    await markManyWatched(itemId, episodes)
    return
  }
  for (const part of chunk(episodes.map((e) => e.id))) {
    await getDb()
      .update(episodesTable)
      .set({ watched: false, watchedAt: null })
      .where(inArray(episodesTable.id, part))
  }
  await recomputeSeriesStatus(itemId)
}

/** Episodios de una serie ordenados por temporada y número. */
export async function orderedEpisodes(itemId: string): Promise<Episode[]> {
  const eps = await episodesOf(itemId)
  return eps.sort((a, b) => a.season - b.season || a.episode - b.episode)
}

/**
 * Recalcula el estado de una serie a partir de sus episodios vistos.
 *
 * 'rewatching' no se toca hasta que se termina: recién empezado el nuevo
 * visionado no hay nada marcado, y eso no debe devolverla a «pendiente».
 */
async function recomputeSeriesStatus(itemId: string): Promise<void> {
  const item = await getItem(itemId)
  if (!item || item.type !== 'series') return
  const eps = await episodesOf(itemId)
  if (eps.length === 0) return
  const watched = eps.filter((e) => e.watched).length

  const patch: Partial<Item> = {}
  if (watched === 0 && item.status === 'watching') {
    patch.status = 'plan'
  } else if (watched > 0 && watched < eps.length) {
    if (item.status === 'plan' || item.status === 'completed') patch.status = 'watching'
    if (!item.startedAt) patch.startedAt = Date.now()
  } else if (watched === eps.length) {
    patch.status = 'completed'
    // No pisar una fecha de "completada" ya existente: si desmarcas un
    // episodio por error y lo vuelves a marcar, no debe parecer que la
    // terminaste hoy si en realidad la terminaste hace tiempo.
    if (!item.completedAt) patch.completedAt = Date.now()
    if (!item.startedAt) patch.startedAt = Date.now()
  }
  if (Object.keys(patch).length) await updateItem(itemId, patch)
}

/* --- Volver a ver una serie ------------------------------------------------ */

async function pastWatchesOf(itemId: string): Promise<PastWatch[]> {
  const rows = await getDb()
    .select()
    .from(pastWatchesTable)
    .where(eq(pastWatchesTable.itemId, itemId))
  return rows.map(rowToPastWatch)
}

/**
 * Empieza a ver otra vez una serie: lo marcado pasa al historial (con su fecha)
 * y los episodios se desmarcan, para seguir el progreso desde cero.
 *
 * Se desmarca en vez de llevar un contador porque así todo lo demás —«Seguir
 * viendo», «Ver siguiente», la barra de progreso— funciona igual que la primera
 * vez sin tener que enseñarle a cada pantalla qué es un revisionado.
 *
 * Devuelve false si no había nada que guardar (ni un episodio visto).
 */
export async function startRewatch(itemId: string): Promise<boolean> {
  const item = await getItem(itemId)
  if (!item || item.type !== 'series') return false
  const seen = (await episodesOf(itemId)).filter((e) => e.watched)
  if (!seen.length) return false

  const past = await pastWatchesOf(itemId)
  const round = past.reduce((max, w) => Math.max(max, w.round), 0) + 1
  const archived: PastWatch[] = seen.map((e) => ({
    id: newId(),
    itemId,
    episodeId: e.id,
    round,
    watchedAt: e.watchedAt,
  }))

  // Todo en una transacción: si se cortara a medias, quedarían episodios
  // desmarcados sin su copia en el historial, y esa fecha se perdería.
  await getDb().transaction(async (tx) => {
    for (const part of chunk(archived)) {
      await tx.insert(pastWatchesTable).values(part.map(pastWatchToRow))
    }
    for (const part of chunk(seen.map((e) => e.id))) {
      await tx
        .update(episodesTable)
        .set({ watched: false, watchedAt: null })
        .where(inArray(episodesTable.id, part))
    }
    await tx
      .update(itemsTable)
      .set({ status: 'rewatching' })
      .where(eq(itemsTable.id, itemId))
  })
  return true
}

/**
 * Deshace `startRewatch` si te has equivocado: devuelve las marcas del último
 * visionado a los episodios. Solo mientras no hayas marcado nada del nuevo,
 * para que deshacer nunca pueda borrar progreso.
 */
export async function undoRewatch(itemId: string): Promise<boolean> {
  const item = await getItem(itemId)
  if (!item || item.status !== 'rewatching') return false
  const eps = await episodesOf(itemId)
  if (eps.some((e) => e.watched)) return false
  const past = await pastWatchesOf(itemId)
  const round = past.reduce((max, w) => Math.max(max, w.round), 0)
  if (!round) return false

  const last = past.filter((w) => w.round === round)
  // Agrupados por fecha para hacer pocos UPDATE: lo normal es que muchos
  // episodios compartan fecha (temporadas marcadas de golpe).
  const byDate = new Map<number | null, string[]>()
  for (const w of last) {
    const key = w.watchedAt ?? null
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key)!.push(w.episodeId)
  }

  await getDb().transaction(async (tx) => {
    for (const [watchedAt, ids] of byDate) {
      for (const part of chunk(ids)) {
        await tx
          .update(episodesTable)
          .set({ watched: true, watchedAt })
          .where(inArray(episodesTable.id, part))
      }
    }
    await tx
      .delete(pastWatchesTable)
      .where(and(eq(pastWatchesTable.itemId, itemId), eq(pastWatchesTable.round, round)))
    // 'completed' de partida y que el recálculo lo corrija: si la serie ha
    // sacado episodios nuevos desde entonces, pasa a «viendo».
    await tx.update(itemsTable).set({ status: 'completed' }).where(eq(itemsTable.id, itemId))
  })
  await recomputeSeriesStatus(itemId)
  return true
}

/**
 * Apunta que has vuelto a ver una película: la fecha que tenía pasa al
 * historial y se pone la nueva (hoy, si no se dice otra).
 *
 * Sin estado «viendo otra vez»: una película se ve de una sentada, no hay
 * progreso que seguir entre medias.
 */
export async function rewatchMovie(itemId: string, when = Date.now()): Promise<boolean> {
  const item = await getItem(itemId)
  if (!item || item.type !== 'movie' || item.status !== 'completed') return false
  const past = await pastWatchesOf(itemId)
  const round = past.reduce((max, w) => Math.max(max, w.round), 0) + 1
  const archived: PastWatch = {
    id: newId(),
    itemId,
    episodeId: itemId,
    round,
    watchedAt: item.completedAt,
  }
  await getDb().transaction(async (tx) => {
    await tx.insert(pastWatchesTable).values(pastWatchToRow(archived))
    await tx.update(itemsTable).set({ completedAt: when }).where(eq(itemsTable.id, itemId))
  })
  return true
}

/** Quita el último «la he vuelto a ver»: la fecha anterior vuelve a ser la actual. */
export async function undoMovieRewatch(itemId: string): Promise<boolean> {
  const item = await getItem(itemId)
  if (!item || item.type !== 'movie') return false
  const past = await pastWatchesOf(itemId)
  const last = past.reduce<PastWatch | undefined>(
    (best, w) => (!best || w.round > best.round ? w : best),
    undefined,
  )
  if (!last) return false
  await getDb().transaction(async (tx) => {
    await tx.delete(pastWatchesTable).where(eq(pastWatchesTable.id, last.id))
    await tx
      .update(itemsTable)
      .set({ status: 'completed', completedAt: last.watchedAt ?? null })
      .where(eq(itemsTable.id, itemId))
  })
  return true
}

export interface PastRound {
  round: number
  episodes: number
  /** Primera y última fecha de ese visionado, de las marcas que tienen fecha. */
  from?: number
  to?: number
}

/** Resumen de cada visionado anterior, del primero al último. */
export function summarizeRounds(past: PastWatch[]): PastRound[] {
  const map = new Map<number, PastRound>()
  for (const w of past) {
    const r = map.get(w.round) ?? { round: w.round, episodes: 0 }
    r.episodes++
    if (w.watchedAt !== undefined) {
      r.from = r.from === undefined ? w.watchedAt : Math.min(r.from, w.watchedAt)
      r.to = r.to === undefined ? w.watchedAt : Math.max(r.to, w.watchedAt)
    }
    map.set(w.round, r)
  }
  return [...map.values()].sort((a, b) => a.round - b.round)
}

/** Las marcas anteriores de cada episodio, de la más antigua a la más reciente. */
export function pastByEpisode(past: PastWatch[]): Map<string, PastWatch[]> {
  const map = new Map<string, PastWatch[]>()
  for (const w of [...past].sort((a, b) => a.round - b.round)) {
    if (!map.has(w.episodeId)) map.set(w.episodeId, [])
    map.get(w.episodeId)!.push(w)
  }
  return map
}

/* --- Estado y valoración --------------------------------------------------- */

export function statusLabel(status: Status, type?: MediaType): string {
  // Los libros se leen, no se ven: cambiamos el vocabulario.
  if (type === 'book') {
    const books: Record<Status, string> = {
      plan: 'Pendiente',
      watching: 'Leyendo',
      rewatching: 'Releyendo',
      completed: 'Leído',
      on_hold: 'En pausa',
      dropped: 'Abandonado',
    }
    return books[status]
  }
  const map: Record<Status, string> = {
    plan: 'Pendiente',
    watching: 'Viendo',
    rewatching: 'Viendo otra vez',
    completed: 'Completado',
    on_hold: 'En pausa',
    dropped: 'Abandonado',
  }
  return map[status]
}

export async function setStatus(itemId: string, status: Status): Promise<void> {
  const item = await getItem(itemId)
  if (!item) return
  // «Viendo otra vez» no es solo una etiqueta: guarda lo visto y desmarca.
  if (status === 'rewatching') {
    if (item.type === 'series' && item.status !== 'rewatching') await startRewatch(itemId)
    return
  }
  const patch: Partial<Item> = { status }
  if (status === 'completed' && !item.completedAt) patch.completedAt = Date.now()
  if (status === 'watching' && !item.startedAt) patch.startedAt = Date.now()
  await updateItem(itemId, patch)
}

export async function setRating(itemId: string, rating: number): Promise<void> {
  await updateItem(itemId, { rating })
}

export async function updateItem(itemId: string, patch: Partial<Item>): Promise<void> {
  const columns = patchToColumns(patch as Record<string, unknown>)
  if (!Object.keys(columns).length) return
  await getDb().update(itemsTable).set(columns).where(eq(itemsTable.id, itemId))
}

/** Borra un item y todo lo asociado (episodios y visionados anteriores). */
export async function deleteItem(itemId: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.delete(episodesTable).where(eq(episodesTable.itemId, itemId))
    await tx.delete(pastWatchesTable).where(eq(pastWatchesTable.itemId, itemId))
    await tx.delete(itemsTable).where(eq(itemsTable.id, itemId))
  })
}

/* --- Libros ---------------------------------------------------------------- */

/**
 * Añade un libro desde Open Library. Devuelve el id local.
 *
 * `source` admite también 'googlebooks' aunque ya no se busque ahí: hace
 * falta para que el `verify` de deduplicación siga probando que dos fuentes
 * distintas con la misma clave son libros distintos, y para no perder tipado
 * si algún día se lee un item ya guardado con esa fuente.
 */
export async function addBook(
  book: {
    key: string
    source: 'openlibrary' | 'googlebooks'
    title: string
    author?: string
    year?: number
    cover?: string
    pages?: number
  },
  status: Status = 'plan',
): Promise<string> {
  const existing = await findBySource('book', book.source, book.key)
  if (existing) return existing.id

  const item: Item = {
    id: newId(),
    type: 'book',
    source: book.source,
    sourceId: book.key,
    title: book.title,
    author: book.author,
    poster: book.cover,
    year: book.year,
    totalPages: book.pages,
    currentPage: 0,
    status,
    rating: 0,
    addedAt: Date.now(),
  }
  await getDb().insert(itemsTable).values(itemToRow(item))
  return item.id
}

/** Añade un libro a mano, sin buscarlo en ninguna fuente (ediciones locales, lo que no salga en Open Library…). */
export async function addManualBook(
  data: { title: string; author?: string; pages?: number },
  status: Status = 'plan',
): Promise<string> {
  const item: Item = {
    id: newId(),
    type: 'book',
    source: 'manual',
    title: data.title,
    author: data.author,
    totalPages: data.pages,
    currentPage: 0,
    status,
    rating: 0,
    addedAt: Date.now(),
  }
  await getDb().insert(itemsTable).values(itemToRow(item))
  return item.id
}

/** Actualiza por qué página vas y ajusta el estado en consecuencia. */
export async function setBookProgress(itemId: string, currentPage: number): Promise<void> {
  const item = await getItem(itemId)
  if (!item || item.type !== 'book') return

  const total = item.totalPages ?? 0
  const page = Math.max(0, total ? Math.min(currentPage, total) : currentPage)
  const patch: Partial<Item> = { currentPage: page }

  if (page === 0) {
    patch.status = 'plan'
  } else if (total && page >= total) {
    patch.status = 'completed'
    patch.completedAt = Date.now()
    if (!item.startedAt) patch.startedAt = Date.now()
  } else {
    patch.status = 'watching' // "leyendo"
    if (!item.startedAt) patch.startedAt = Date.now()
  }

  await updateItem(itemId, patch)
}

/** Porcentaje leído de un libro (0 si no sabemos las páginas totales). */
export function bookPercent(item: Item): number {
  if (!item.totalPages || !item.currentPage) return 0
  return Math.min(100, Math.round((item.currentPage / item.totalPages) * 100))
}

