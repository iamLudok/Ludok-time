import { eq, ne } from 'drizzle-orm'
import { useLiveQuery } from 'drizzle-orm/expo-sqlite'
import { db } from '../lib/db'
import { items as itemsTable, episodes as episodesTable } from '../lib/schema'
import { rowToItem, rowToEpisode } from '../lib/rows'
import type { Item, Episode } from '../types'

/**
 * La biblioteca, reactiva. Excluye los vídeos de YouTube: viven en su propia
 * pestaña porque al importar el historial pueden ser miles y sepultarían el
 * resto — el mismo criterio que en la web.
 */
export function useLibraryItems(): Item[] {
  const { data } = useLiveQuery(
    db.select().from(itemsTable).where(ne(itemsTable.type, 'youtube')).orderBy(itemsTable.addedAt),
  )
  // Drizzle ordena ascendente; la biblioteca se ve con lo más reciente primero.
  return (data ?? []).map(rowToItem).reverse()
}

/** Los vídeos de YouTube, reactivos y ya ordenados por lo último visto. */
export function useVideos(): Item[] {
  const { data } = useLiveQuery(
    db.select().from(itemsTable).where(eq(itemsTable.type, 'youtube')),
  )
  return (data ?? []).map(rowToItem).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
}

/** Un título por su id. `undefined` mientras carga, `null` si no existe. */
export function useItem(id: string | undefined): Item | null | undefined {
  const { data } = useLiveQuery(
    db.select().from(itemsTable).where(eq(itemsTable.id, id ?? '')),
  )
  if (!id) return null
  if (data === undefined) return undefined
  return data[0] ? rowToItem(data[0]) : null
}

/** Episodios de una serie, ordenados por temporada y número. */
export function useEpisodes(itemId: string | undefined): Episode[] {
  const { data } = useLiveQuery(
    db.select().from(episodesTable).where(eq(episodesTable.itemId, itemId ?? '')),
  )
  return (data ?? [])
    .map(rowToEpisode)
    .sort((a, b) => a.season - b.season || a.episode - b.episode)
}

/** Todos los episodios (para «Continuar viendo», que mira varias series a la vez). */
export function useAllEpisodes(): Episode[] {
  const { data } = useLiveQuery(db.select().from(episodesTable))
  return (data ?? []).map(rowToEpisode)
}
