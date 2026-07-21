import { db, newId } from './db'
import { getMovie, getSeries, getSeasonEpisodes, posterUrl } from './tmdb'
import type { Item, Episode, Activity, ActivityKind, MediaType, Status } from '../types'

/** Etiqueta que marca una serie como anime. */
export const ANIME_TAG = 'anime'

/** True si el item es una serie marcada como anime. */
export function isAnime(item: Pick<Item, 'type' | 'tags'>): boolean {
  return item.type === 'series' && item.tags.includes(ANIME_TAG)
}

async function logActivity(
  itemId: string,
  kind: ActivityKind,
  label: string,
  episodeId?: string,
): Promise<void> {
  const entry: Activity = { id: newId(), itemId, episodeId, kind, label, at: Date.now() }
  await db.activity.add(entry)
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
    tags: [],
    addedAt: Date.now(),
    startedAt: status === 'completed' ? Date.now() : undefined,
    completedAt: status === 'completed' ? Date.now() : undefined,
  }
  await db.items.add(item)
  await logActivity(item.id, 'added', item.title)
  if (status === 'completed') await logActivity(item.id, 'watched_movie', item.title)
  return item.id
}

/**
 * Añade una serie desde TMDB, trayendo todos sus episodios (sin marcar).
 * `tags` permite marcarla como anime (ANIME_TAG). Devuelve el id local.
 */
export async function addSeriesFromTmdb(
  tmdbId: number,
  status: Status = 'plan',
  tags: string[] = [],
): Promise<string> {
  const existing = await db.items
    .where('type')
    .equals('series')
    .and((i) => i.source === 'tmdb' && i.sourceId === String(tmdbId))
    .first()
  if (existing) return existing.id

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
    tags,
    addedAt: Date.now(),
  }
  await db.items.add(item)
  await logActivity(itemId, 'added', item.title)

  // Traemos episodios de cada temporada en paralelo.
  const seasons = await Promise.all(
    s.seasons.map((season) => getSeasonEpisodes(tmdbId, season.seasonNumber)),
  )
  const episodes: Episode[] = seasons.flat().map((e) => ({
    id: newId(),
    itemId,
    season: e.season,
    episode: e.episode,
    title: e.title,
    airDate: e.airDate,
    runtime: e.runtime,
    watched: false,
  }))
  if (episodes.length) await db.episodes.bulkAdd(episodes)
  return itemId
}

function epLabel(ep: Episode): string {
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
  await logActivity(
    ep.itemId,
    watched ? 'watched_episode' : 'unwatched_episode',
    epLabel(ep),
    episodeId,
  )
  await recomputeSeriesStatus(ep.itemId)
}

/** Marca como vistos todos los episodios hasta (incluido) uno dado, en orden. */
export async function markWatchedUpTo(itemId: string, episodeId: string): Promise<void> {
  const eps = await orderedEpisodes(itemId)
  const idx = eps.findIndex((e) => e.id === episodeId)
  if (idx < 0) return
  const now = Date.now()
  const toMark = eps.slice(0, idx + 1).filter((e) => !e.watched)
  await db.episodes.bulkPut(toMark.map((e) => ({ ...e, watched: true, watchedAt: now })))
  if (toMark.length) {
    await logActivity(itemId, 'watched_episode', `${toMark.length} episodios hasta ${epLabel(eps[idx])}`)
  }
  await recomputeSeriesStatus(itemId)
}

/** Episodios de una serie ordenados por temporada y número. */
export async function orderedEpisodes(itemId: string): Promise<Episode[]> {
  const eps = await db.episodes.where('itemId').equals(itemId).toArray()
  return eps.sort((a, b) => a.season - b.season || a.episode - b.episode)
}

/** Siguiente episodio no visto (en orden). undefined si no queda ninguno. */
export async function nextUnwatched(itemId: string): Promise<Episode | undefined> {
  const eps = await orderedEpisodes(itemId)
  return eps.find((e) => !e.watched)
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
    patch.completedAt = Date.now()
    if (!item.startedAt) patch.startedAt = Date.now()
  }
  if (Object.keys(patch).length) {
    await db.items.update(itemId, patch)
    if (patch.status) await logActivity(itemId, 'status_change', statusLabel(patch.status))
  }
}

export function statusLabel(status: Status): string {
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
  await logActivity(itemId, 'status_change', statusLabel(status))
  if (status === 'completed' && item.type === 'movie') {
    await logActivity(itemId, 'watched_movie', item.title)
  }
}

export async function setRating(itemId: string, rating: number): Promise<void> {
  await db.items.update(itemId, { rating })
  const item = await db.items.get(itemId)
  if (item) await logActivity(itemId, 'rated', `${rating}/10 · ${item.title}`)
}

export async function updateItem(itemId: string, patch: Partial<Item>): Promise<void> {
  await db.items.update(itemId, patch)
}

/** Borra un item y todo lo asociado (episodios y actividad). */
export async function deleteItem(itemId: string): Promise<void> {
  await db.transaction('rw', db.items, db.episodes, db.activity, async () => {
    await db.episodes.where('itemId').equals(itemId).delete()
    await db.activity.where('itemId').equals(itemId).delete()
    await db.items.delete(itemId)
  })
}

export interface Progress {
  total: number
  watched: number
  percent: number
}

export async function seriesProgress(itemId: string): Promise<Progress> {
  const eps = await db.episodes.where('itemId').equals(itemId).toArray()
  const total = eps.length
  const watched = eps.filter((e) => e.watched).length
  return { total, watched, percent: total ? Math.round((watched / total) * 100) : 0 }
}
