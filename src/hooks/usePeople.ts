import { useLiveQuery } from 'drizzle-orm/expo-sqlite'
import { db } from '../lib/db'
import { people as peopleTable } from '../lib/schema'
import { rowToPerson } from '../lib/rows'
import type { Person } from '../types'

/**
 * Actores favoritos, reactivo.
 *
 * `ready` importa por lo de siempre: `useLiveQuery` arranca con la lista vacía y
 * consulta en un efecto, así que sin mirarlo no se distingue «no tienes ninguno»
 * de «todavía no ha respondido».
 */
export function useFavourites(): { data: Person[]; ready: boolean } {
  const { data, updatedAt } = useLiveQuery(db.select().from(peopleTable))
  return {
    data: (data ?? []).map(rowToPerson).sort((a, b) => b.addedAt - a.addedAt),
    ready: updatedAt !== undefined,
  }
}

/** Si un actor concreto está entre los favoritos. */
export function useIsFavourite(tmdbId: number | undefined): boolean {
  const { data } = useFavourites()
  return data.some((p) => p.tmdbId === tmdbId)
}
