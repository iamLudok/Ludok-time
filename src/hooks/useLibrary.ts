import { eq, ne } from 'drizzle-orm'
import { useLiveQuery } from 'drizzle-orm/expo-sqlite'
import { db } from '../lib/db'
import { items as itemsTable, episodes as episodesTable } from '../lib/schema'
import { rowToItem, rowToEpisode } from '../lib/rows'
import type { Item, Episode } from '../types'

/**
 * ⚠️ `useLiveQuery` de Drizzle arranca con `data = []` y lanza la consulta en un
 * efecto, así que en el primer render «sin filas» es indistinguible de «todavía
 * no ha respondido». `updatedAt` es lo que de verdad indica que ya hay
 * respuesta: sin mirarlo, una ficha recién creada aparecía como «No encontrado»
 * hasta que llegaba la consulta.
 */

export interface Query<T> {
  data: T
  /** false hasta que la consulta ha devuelto algo por primera vez. */
  ready: boolean
}

/**
 * La biblioteca, reactiva. Excluye los vídeos de YouTube: viven en su propia
 * pestaña porque al importar el historial pueden ser miles y sepultarían el
 * resto — el mismo criterio que en la web.
 */
export function useLibraryItems(): Query<Item[]> {
  const { data, updatedAt } = useLiveQuery(
    db.select().from(itemsTable).where(ne(itemsTable.type, 'youtube')).orderBy(itemsTable.addedAt),
  )
  // Drizzle ordena ascendente; la biblioteca se ve con lo más reciente primero.
  return { data: (data ?? []).map(rowToItem).reverse(), ready: updatedAt !== undefined }
}

/** Los vídeos de YouTube, reactivos y ya ordenados por lo último visto. */
export function useVideos(): Query<Item[]> {
  const { data, updatedAt } = useLiveQuery(
    db.select().from(itemsTable).where(eq(itemsTable.type, 'youtube')),
  )
  return {
    data: (data ?? []).map(rowToItem).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
    ready: updatedAt !== undefined,
  }
}

/** Un título por su id. `undefined` mientras carga, `null` si de verdad no existe. */
export function useItem(id: string | undefined): Item | null | undefined {
  const { data, updatedAt } = useLiveQuery(
    db.select().from(itemsTable).where(eq(itemsTable.id, id ?? '')),
    [id],
  )
  if (!id) return null
  if (updatedAt === undefined) return undefined
  return data[0] ? rowToItem(data[0]) : null
}

/** Episodios de una serie, ordenados por temporada y número. */
export function useEpisodes(itemId: string | undefined): Episode[] {
  const { data } = useLiveQuery(
    db.select().from(episodesTable).where(eq(episodesTable.itemId, itemId ?? '')),
    [itemId],
  )
  return (data ?? [])
    .map(rowToEpisode)
    .sort((a, b) => a.season - b.season || a.episode - b.episode)
}

/** Todos los episodios (la Biblioteca los reparte a sus tarjetas y a «Continuar viendo»). */
export function useAllEpisodes(): Episode[] {
  const { data } = useLiveQuery(db.select().from(episodesTable))
  return (data ?? []).map(rowToEpisode)
}
