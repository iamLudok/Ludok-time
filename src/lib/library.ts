import { db, newId } from './db'
import { getMovie, getSeries, getSeasonEpisodes, posterUrl } from './tmdb'
import { getSettings } from './settings'
import type { Item, Episode, Activity, ActivityKind, MediaType, Status } from '../types'

/**
 * Registra una entrada de consumo en el diario ("he visto/leído X").
 * En modo "puesta al día" (ver Settings.catchUpMode) no escribe nada: sirve
 * para volcar historial antiguo sin ensuciar el diario con fechas falsas.
 * `at` permite fijar el momento exacto (para conservar el orden real al
 * marcar varios episodios de golpe).
 */
async function logActivity(
  itemId: string,
  kind: ActivityKind,
  label: string,
  episodeId?: string,
  at: number = Date.now(),
): Promise<void> {
  const { catchUpMode } = await getSettings()
  if (catchUpMode) return
  const entry: Activity = { id: newId(), itemId, episodeId, kind, label, at }
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
  if (status === 'completed') await logActivity(item.id, 'watched_movie', item.title)
  return item.id
}

/** Añade una serie desde TMDB, trayendo todos sus episodios (sin marcar). Devuelve el id local. */
export async function addSeriesFromTmdb(tmdbId: number, status: Status = 'plan'): Promise<string> {
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
    tags: [],
    addedAt: Date.now(),
  }
  await db.items.add(item)

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
  // Desmarcar es corregir un error, no "consumo": no genera entrada de diario.
  if (watched) await logActivity(ep.itemId, 'watched_episode', epLabel(ep), episodeId)
  await recomputeSeriesStatus(ep.itemId)
}

/**
 * Marca como vistos varios episodios de golpe (p. ej. "hasta aquí" o toda una
 * temporada). Cada uno genera SU PROPIA entrada en el diario —no un mensaje
 * agregado tipo "6 episodios hasta X"— con marcas de tiempo escalonadas en
 * milisegundos para conservar el orden real dentro del mismo minuto.
 */
async function markManyWatched(itemId: string, episodes: Episode[]): Promise<void> {
  const toMark = episodes.filter((e) => !e.watched)
  if (!toMark.length) return
  const base = Date.now()
  await db.episodes.bulkPut(toMark.map((e, i) => ({ ...e, watched: true, watchedAt: base + i })))
  for (let i = 0; i < toMark.length; i++) {
    await logActivity(itemId, 'watched_episode', epLabel(toMark[i]), toMark[i].id, base + i)
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
  // Desmarcar tampoco genera entradas de diario (ver setEpisodeWatched).
  await db.episodes.bulkPut(episodes.map((e) => ({ ...e, watched: false, watchedAt: undefined })))
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
  if (status === 'completed' && item.type === 'movie') {
    await logActivity(itemId, 'watched_movie', item.title)
  }
}

export async function setRating(itemId: string, rating: number): Promise<void> {
  await db.items.update(itemId, { rating })
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

// --- Libros -----------------------------------------------------------------

/** Añade un libro desde Open Library. Devuelve el id local. */
export async function addBook(
  book: { key: string; title: string; author?: string; year?: number; cover?: string; pages?: number },
  status: Status = 'plan',
): Promise<string> {
  const existing = await db.items
    .where('type')
    .equals('book')
    .and((i) => i.source === 'openlibrary' && i.sourceId === book.key)
    .first()
  if (existing) return existing.id

  const item: Item = {
    id: newId(),
    type: 'book',
    source: 'openlibrary',
    sourceId: book.key,
    title: book.title,
    author: book.author,
    poster: book.cover,
    year: book.year,
    totalPages: book.pages,
    currentPage: 0,
    status,
    rating: 0,
    tags: [],
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
  // Terminar un libro sí es "consumo": entra en el diario. Los demás cambios
  // de estado (empezar a leerlo, volver a "pendiente"…) no.
  if (patch.status === 'completed' && item.status !== 'completed') {
    await logActivity(itemId, 'book_finished', item.title)
  }
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
    tags: [],
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
    tags: [],
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
      tags: [],
      addedAt: Date.now(),
      startedAt: watchedAt,
      completedAt: watchedAt,
    })
  }

  if (nuevos.length) await db.items.bulkAdd(nuevos)
  return { added: nuevos.length, skipped }
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
