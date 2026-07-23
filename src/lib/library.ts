import { db, newId } from './db'
import { getMovie, getSeries, getSeasonEpisodes, posterUrl } from './tmdb'
import type { Item, Episode, MediaType, Status } from '../types'

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

/** Añade una película desde TMDB a la biblioteca. Devuelve el id local. */
export async function addMovieFromTmdb(
  tmdbId: number,
  type: MediaType = 'movie',
  status: Status = 'plan',
): Promise<string> {
  const existing = await db.items
    .where('type')
    .equals(type)
    .and((i) => i.source === 'tmdb' && i.sourceId === String(tmdbId))
    .first()
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
  await db.items.add(item)
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
  const existing = await db.items
    .where('type')
    .equals('series')
    .and((i) => i.source === 'tmdb' && i.sourceId === String(tmdbId))
    .first()
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
  await db.items.add(item)

  // Como máximo 4 temporadas a la vez: series muy longevas (cientos de
  // episodios) podían disparar decenas de peticiones simultáneas y chocar
  // con el límite de tasa de TMDB, perdiendo episodios sin avisar.
  const { results: seasons, failed: failedSeasons } = await mapWithConcurrency(
    s.seasons,
    4,
    (season) => getSeasonEpisodes(tmdbId, season.seasonNumber),
  )
  const episodes: Episode[] = seasons.flat().map((e) => ({
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
  if (episodes.length) await db.episodes.bulkAdd(episodes)
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
  const item = await db.items.get(itemId)
  if (!item || item.type !== 'series' || item.source !== 'tmdb' || !item.sourceId) {
    return { added: 0, failedSeasons: 0 }
  }
  const tmdbId = Number(item.sourceId)

  const [s, existing] = await Promise.all([
    getSeries(tmdbId),
    db.episodes.where('itemId').equals(itemId).toArray(),
  ])
  const have = new Set(existing.map((e) => `${e.season}-${e.episode}`))

  const { results: seasons, failed: failedSeasons } = await mapWithConcurrency(
    s.seasons,
    4,
    (season) => getSeasonEpisodes(tmdbId, season.seasonNumber),
  )
  const nuevos: Episode[] = seasons
    .flat()
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
  if (nuevos.length) await db.episodes.bulkAdd(nuevos)
  return { added: nuevos.length, failedSeasons }
}

/**
 * Rellena la foto (still) de episodios que ya estaban guardados de antes de
 * que existiera esta función — no toca visto/fecha de ninguno. Solo pide a
 * TMDB las temporadas que de verdad tienen algún episodio sin foto.
 */
export async function backfillEpisodeStills(itemId: string): Promise<number> {
  const item = await db.items.get(itemId)
  if (!item || item.type !== 'series' || item.source !== 'tmdb' || !item.sourceId) return 0

  const existing = await db.episodes.where('itemId').equals(itemId).toArray()
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

  await db.episodes.bulkPut(updates.map(({ e, still }) => ({ ...e, still })))
  return updates.length
}

export function epLabel(ep: Episode): string {
  const code = `S${ep.season}E${ep.episode}`
  return ep.title ? `${code} · ${ep.title}` : code
}

/** Marca/desmarca un episodio y actualiza el estado de la serie. */
export async function setEpisodeWatched(episodeId: string, watched: boolean): Promise<void> {
  const ep = await db.episodes.get(episodeId)
  if (!ep) return
  await db.episodes.update(episodeId, {
    watched,
    watchedAt: watched ? Date.now() : undefined,
  })
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
  await db.episodes.update(episodeId, { watchedAt })
}

/** Marca como vistos varios episodios de golpe (p. ej. "hasta aquí" o toda una temporada). */
async function markManyWatched(itemId: string, episodes: Episode[]): Promise<void> {
  const toMark = episodes.filter((e) => !e.watched)
  if (!toMark.length) return
  const now = Date.now()
  await db.episodes.bulkPut(toMark.map((e) => ({ ...e, watched: true, watchedAt: now })))
  await recomputeSeriesStatus(itemId)
}

/** Marca como vistos todos los episodios hasta (incluido) uno dado, en orden. */
export async function markWatchedUpTo(itemId: string, episodeId: string): Promise<void> {
  const eps = await orderedEpisodes(itemId)
  const idx = eps.findIndex((e) => e.id === episodeId)
  if (idx < 0) return
  await markManyWatched(itemId, eps.slice(0, idx + 1))
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
  await db.episodes.bulkPut(episodes.map((e) => ({ ...e, watched: false, watchedAt: undefined })))
  await recomputeSeriesStatus(itemId)
}

/** Episodios de una serie ordenados por temporada y número. */
export async function orderedEpisodes(itemId: string): Promise<Episode[]> {
  const eps = await db.episodes.where('itemId').equals(itemId).toArray()
  return eps.sort((a, b) => a.season - b.season || a.episode - b.episode)
}

/** Recalcula el estado de una serie a partir de sus episodios vistos. */
async function recomputeSeriesStatus(itemId: string): Promise<void> {
  const item = await db.items.get(itemId)
  if (!item || item.type !== 'series') return
  const eps = await db.episodes.where('itemId').equals(itemId).toArray()
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
  if (Object.keys(patch).length) {
    await db.items.update(itemId, patch)
  }
}

export function statusLabel(status: Status, type?: MediaType): string {
  // Los libros se leen, no se ven: cambiamos el vocabulario.
  if (type === 'book') {
    const books: Record<Status, string> = {
      plan: 'Pendiente',
      watching: 'Leyendo',
      completed: 'Leído',
      on_hold: 'En pausa',
      dropped: 'Abandonado',
    }
    return books[status]
  }
  const map: Record<Status, string> = {
    plan: 'Pendiente',
    watching: 'Viendo',
    completed: 'Completado',
    on_hold: 'En pausa',
    dropped: 'Abandonado',
  }
  return map[status]
}

export async function setStatus(itemId: string, status: Status): Promise<void> {
  const item = await db.items.get(itemId)
  if (!item) return
  const patch: Partial<Item> = { status }
  if (status === 'completed' && !item.completedAt) patch.completedAt = Date.now()
  if (status === 'watching' && !item.startedAt) patch.startedAt = Date.now()
  await db.items.update(itemId, patch)
}

export async function setRating(itemId: string, rating: number): Promise<void> {
  await db.items.update(itemId, { rating })
}

export async function updateItem(itemId: string, patch: Partial<Item>): Promise<void> {
  await db.items.update(itemId, patch)
}

/** Borra un item y todo lo asociado (episodios). */
export async function deleteItem(itemId: string): Promise<void> {
  await db.transaction('rw', db.items, db.episodes, async () => {
    await db.episodes.where('itemId').equals(itemId).delete()
    await db.items.delete(itemId)
  })
}

// --- Libros -----------------------------------------------------------------

/** Añade un libro desde Open Library. Devuelve el id local. */
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
  const existing = await db.items
    .where('type')
    .equals('book')
    .and((i) => i.source === book.source && i.sourceId === book.key)
    .first()
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
  await db.items.add(item)
  return item.id
}

/** Añade un libro a mano, sin buscarlo en ninguna fuente (mangas raros, ediciones locales…). */
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
  await db.items.add(item)
  return item.id
}

/** Actualiza por qué página vas y ajusta el estado en consecuencia. */
export async function setBookProgress(itemId: string, currentPage: number): Promise<void> {
  const item = await db.items.get(itemId)
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

  await db.items.update(itemId, patch)
}

/** Porcentaje leído de un libro (0 si no sabemos las páginas totales). */
export function bookPercent(item: Item): number {
  if (!item.totalPages || !item.currentPage) return 0
  return Math.min(100, Math.round((item.currentPage / item.totalPages) * 100))
}

// --- Vídeos de YouTube ------------------------------------------------------
// Nota: los vídeos NO generan entradas en el diario. Al importar historial
// pueden ser miles y ahogarían el resto. Tienen su propia sección.

export interface VideoInput {
  videoId: string
  title: string
  channel?: string
  watchedAt?: number
}

/** Añade un vídeo de YouTube. Devuelve el id local (o el existente si ya estaba). */
export async function addVideo(video: VideoInput): Promise<string> {
  const existing = await db.items
    .where('type')
    .equals('youtube')
    .and((i) => i.sourceId === video.videoId)
    .first()
  if (existing) return existing.id

  const watchedAt = video.watchedAt ?? Date.now()
  const item: Item = {
    id: newId(),
    type: 'youtube',
    source: 'youtube',
    sourceId: video.videoId,
    title: video.title,
    author: video.channel,
    poster: `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`,
    url: `https://www.youtube.com/watch?v=${video.videoId}`,
    status: 'completed',
    rating: 0,
    addedAt: Date.now(),
    startedAt: watchedAt,
    completedAt: watchedAt,
  }
  await db.items.add(item)
  return item.id
}

/** Añade un vídeo escrito a mano, sin enlace. */
export async function addManualVideo(title: string): Promise<string> {
  const item: Item = {
    id: newId(),
    type: 'youtube',
    source: 'manual',
    title,
    status: 'completed',
    rating: 0,
    addedAt: Date.now(),
    completedAt: Date.now(),
  }
  await db.items.add(item)
  return item.id
}

export interface ImportVideosResult {
  added: number
  skipped: number
}

/** Importa muchos vídeos de golpe (historial de Takeout), evitando duplicados. */
export async function importVideos(entries: VideoInput[]): Promise<ImportVideosResult> {
  const existing = await db.items.where('type').equals('youtube').toArray()
  const known = new Set(existing.map((i) => i.sourceId).filter(Boolean) as string[])

  const nuevos: Item[] = []
  let skipped = 0
  for (const v of entries) {
    if (known.has(v.videoId)) {
      skipped++
      continue
    }
    known.add(v.videoId)
    const watchedAt = v.watchedAt ?? Date.now()
    nuevos.push({
      id: newId(),
      type: 'youtube',
      source: 'youtube',
      sourceId: v.videoId,
      title: v.title,
      author: v.channel,
      poster: `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${v.videoId}`,
      status: 'completed',
      rating: 0,
      addedAt: Date.now(),
      startedAt: watchedAt,
      completedAt: watchedAt,
    })
  }

  if (nuevos.length) await db.items.bulkAdd(nuevos)
  return { added: nuevos.length, skipped }
}
