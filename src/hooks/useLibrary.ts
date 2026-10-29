import { eq } from 'drizzle-orm'
import { useEffect, useState } from 'react'
import { addDatabaseChangeListener } from 'expo-sqlite'
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core'
import { db } from '../lib/db'
import {
  items as itemsTable,
  episodes as episodesTable,
  pastWatches as pastWatchesTable,
} from '../lib/schema'
import { rowToItem, rowToEpisode, rowToPastWatch } from '../lib/rows'
import type { Item, Episode, PastWatch } from '../types'

/**
 * ⚠️ `useLiveQuery` de Drizzle arranca con `data = []` y lanza la consulta en un
 * efecto, así que en el primer render «sin filas» es indistinguible de «todavía
 * no ha respondido». `updatedAt` es lo que de verdad indica que ya hay
 * respuesta: sin mirarlo, una ficha recién creada aparecía como «No encontrado»
 * hasta que llegaba la consulta.
 */

/**
 * `useLiveQuery` de Drizzle, pero agrupando los avisos de cambio.
 *
 * SQLite avisa de CADA FILA escrita, y el de Drizzle vuelve a leer la tabla
 * entera con cada aviso. Al añadir una serie de 400 episodios eran 400 lecturas
 * completas por pantalla que escucha esa tabla, todas en el hilo de JS: la ficha
 * recién abierta se quedaba en cola detrás y mostraba el círculo de carga un
 * buen rato. Aquí la primera lectura es inmediata y las siguientes esperan a que
 * dejen de llegar avisos (`SETTLE_MS`) para leer una sola vez.
 */
const SETTLE_MS = 80

function useLiveQuery<T>(
  table: SQLiteTable,
  query: PromiseLike<T>,
  deps: unknown[] = [],
): { data: T | undefined; updatedAt: Date | undefined } {
  const [data, setData] = useState<T | undefined>(undefined)
  const [updatedAt, setUpdatedAt] = useState<Date | undefined>(undefined)

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const run = () => {
      Promise.resolve(query).then(
        (rows) => {
          if (!alive) return
          setData(rows)
          setUpdatedAt(new Date())
        },
        () => {},
      )
    }
    run()
    const name = getTableConfig(table).name
    const listener = addDatabaseChangeListener(({ tableName }) => {
      if (tableName !== name) return
      clearTimeout(timer)
      timer = setTimeout(run, SETTLE_MS)
    })
    return () => {
      alive = false
      clearTimeout(timer)
      listener.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, updatedAt }
}

export interface Query<T> {
  data: T
  /** false hasta que la consulta ha devuelto algo por primera vez. */
  ready: boolean
}

/** La biblioteca, reactiva. */
export function useLibraryItems(): Query<Item[]> {
  const { data, updatedAt } = useLiveQuery(
    itemsTable,
    db.select().from(itemsTable).orderBy(itemsTable.addedAt),
  )
  // Drizzle ordena ascendente; la biblioteca se ve con lo más reciente primero.
  return { data: (data ?? []).map(rowToItem).reverse(), ready: updatedAt !== undefined }
}

/** Un título por su id. `undefined` mientras carga, `null` si de verdad no existe. */
export function useItem(id: string | undefined): Item | null | undefined {
  const { data, updatedAt } = useLiveQuery(
    itemsTable,
    db.select().from(itemsTable).where(eq(itemsTable.id, id ?? '')),
    [id],
  )
  if (!id) return null
  if (updatedAt === undefined) return undefined
  return data?.[0] ? rowToItem(data[0]) : null
}

/** Episodios de una serie, ordenados por temporada y número. */
export function useEpisodes(itemId: string | undefined): Episode[] {
  const { data } = useLiveQuery(
    episodesTable,
    db.select().from(episodesTable).where(eq(episodesTable.itemId, itemId ?? '')),
    [itemId],
  )
  return (data ?? [])
    .map(rowToEpisode)
    .sort((a, b) => a.season - b.season || a.episode - b.episode)
}

/** Todos los episodios (la Biblioteca los reparte a sus tarjetas y a «Continuar viendo»). */
export function useAllEpisodes(): Episode[] {
  const { data } = useLiveQuery(episodesTable, db.select().from(episodesTable))
  return (data ?? []).map(rowToEpisode)
}

/** Marcas de los visionados anteriores de una serie. */
export function usePastWatches(itemId: string | undefined): PastWatch[] {
  const { data } = useLiveQuery(
    pastWatchesTable,
    db.select().from(pastWatchesTable).where(eq(pastWatchesTable.itemId, itemId ?? '')),
    [itemId],
  )
  return (data ?? []).map(rowToPastWatch)
}

/** Todas las marcas de visionados anteriores (para las estadísticas). */
export function useAllPastWatches(): PastWatch[] {
  const { data } = useLiveQuery(pastWatchesTable, db.select().from(pastWatchesTable))
  return (data ?? []).map(rowToPastWatch)
}
