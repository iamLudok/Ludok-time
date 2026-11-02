// Consultas que comparten todos los módulos de la biblioteca. No se reexportan
// desde `index.ts` salvo `hasEpisode` y `updateItem`: el resto son piezas
// internas, y sacarlas fuera invitaría a saltarse las reglas de cada módulo
// (p. ej. tocar episodios sin recalcular el estado de la serie).
import { eq, and } from 'drizzle-orm'
import { getDb } from '../dbRef'
import { items as itemsTable, episodes as episodesTable, pastWatches as pastWatchesTable } from '../schema'
import { rowToItem, rowToEpisode, rowToPastWatch, episodeToRow } from '../rows'
import { chunk, excludedSet, patchToColumns } from '../sqlHelpers'
import type { Item, Episode, MediaType, PastWatch } from '../../types'

export async function getItem(itemId: string): Promise<Item | undefined> {
  const rows = await getDb().select().from(itemsTable).where(eq(itemsTable.id, itemId)).limit(1)
  return rows[0] ? rowToItem(rows[0]) : undefined
}

export async function getEpisode(episodeId: string): Promise<Episode | undefined> {
  const rows = await getDb().select().from(episodesTable).where(eq(episodesTable.id, episodeId)).limit(1)
  return rows[0] ? rowToEpisode(rows[0]) : undefined
}

export async function episodesOf(itemId: string): Promise<Episode[]> {
  const rows = await getDb().select().from(episodesTable).where(eq(episodesTable.itemId, itemId))
  return rows.map(rowToEpisode)
}

export async function pastWatchesOf(itemId: string): Promise<PastWatch[]> {
  const rows = await getDb()
    .select()
    .from(pastWatchesTable)
    .where(eq(pastWatchesTable.itemId, itemId))
  return rows.map(rowToPastWatch)
}

/** Busca un título ya guardado por su fuente externa (evita duplicados). */
export async function findBySource(
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

export async function insertEpisodes(eps: Episode[]): Promise<void> {
  for (const part of chunk(eps)) {
    await getDb().insert(episodesTable).values(part.map(episodeToRow))
  }
}

/** Equivalente a bulkPut: inserta o actualiza por id. */
export async function upsertEpisodes(eps: Episode[]): Promise<void> {
  for (const part of chunk(eps)) {
    await getDb()
      .insert(episodesTable)
      .values(part.map(episodeToRow))
      .onConflictDoUpdate({ target: episodesTable.id, set: excludedSet(episodesTable) })
  }
}

export async function updateItem(itemId: string, patch: Partial<Item>): Promise<void> {
  const columns = patchToColumns(patch as Record<string, unknown>)
  if (!Object.keys(columns).length) return
  await getDb().update(itemsTable).set(columns).where(eq(itemsTable.id, itemId))
}

/**
 * Recalcula el estado de una serie a partir de sus episodios vistos.
 *
 * Está aquí y no en `episodes.ts` porque también lo necesitan la sincronización
 * con TMDB y los revisionados; así ningún módulo depende de otro en círculo.
 *
 * 'rewatching' no se toca hasta que se termina: recién empezado el nuevo
 * visionado no hay nada marcado, y eso no debe devolverla a «pendiente».
 */
export async function recomputeSeriesStatus(itemId: string): Promise<void> {
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
