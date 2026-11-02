// Marcar episodios como vistos, uno a uno o de golpe.
import { eq, inArray } from 'drizzle-orm'
import { getDb } from '../dbRef'
import { episodes as episodesTable } from '../schema'
import { chunk } from '../sqlHelpers'
import type { Episode } from '../../types'
import { getEpisode, episodesOf, updateItem, recomputeSeriesStatus } from './queries'

export function epLabel(ep: Episode): string {
  const code = `S${ep.season}E${ep.episode}`
  return ep.title ? `${code} · ${ep.title}` : code
}

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
