// Volver a ver una serie o una película, y el historial de visionados anteriores.
import { eq, and, inArray } from 'drizzle-orm'
import { getDb } from '../dbRef'
import { newId } from '../ids'
import { items as itemsTable, episodes as episodesTable, pastWatches as pastWatchesTable } from '../schema'
import { pastWatchToRow } from '../rows'
import { chunk } from '../sqlHelpers'
import type { PastWatch } from '../../types'
import { getItem, episodesOf, pastWatchesOf, recomputeSeriesStatus } from './queries'

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
