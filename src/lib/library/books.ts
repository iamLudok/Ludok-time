// Libros: añadirlos (de Open Library o a mano) y llevar por qué página vas.
import { getDb } from '../dbRef'
import { newId } from '../ids'
import { items as itemsTable } from '../schema'
import { itemToRow } from '../rows'
import type { Item, Status } from '../../types'
import { getItem, findBySource, updateItem } from './queries'

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
