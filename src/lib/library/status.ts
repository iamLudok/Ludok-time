// Estado, valoración y borrado de cualquier título.
import { eq } from 'drizzle-orm'
import { getDb } from '../dbRef'
import { items as itemsTable, episodes as episodesTable, pastWatches as pastWatchesTable } from '../schema'
import type { Item, MediaType, Status } from '../../types'
import { getItem, updateItem } from './queries'
import { startRewatch } from './rewatch'

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

/** Borra un item y todo lo asociado (episodios y visionados anteriores). */
export async function deleteItem(itemId: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.delete(episodesTable).where(eq(episodesTable.itemId, itemId))
    await tx.delete(pastWatchesTable).where(eq(pastWatchesTable.itemId, itemId))
    await tx.delete(itemsTable).where(eq(itemsTable.id, itemId))
  })
}
