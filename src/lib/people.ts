import { eq } from 'drizzle-orm'
import { getDb } from './dbRef'
import { newId } from './ids'
import { people as peopleTable } from './schema'
import { rowToPerson, personToRow } from './rows'
import type { Person } from '../types'

/**
 * Actores favoritos.
 *
 * Solo se guardan los que marcas: el reparto de cada título se pide a TMDB en
 * vivo y no se guarda nada, porque cambia y porque guardar cientos de nombres
 * por serie no aporta nada a una app de llevar la cuenta.
 */

/** Todos los favoritos, el último marcado primero. */
export async function listFavourites(): Promise<Person[]> {
  const rows = await getDb().select().from(peopleTable)
  return rows.map(rowToPerson).sort((a, b) => b.addedAt - a.addedAt)
}

export async function isFavourite(tmdbId: number): Promise<boolean> {
  const rows = await getDb()
    .select()
    .from(peopleTable)
    .where(eq(peopleTable.tmdbId, tmdbId))
    .limit(1)
  return !!rows[0]
}

/** Marca un actor como favorito. Si ya lo estaba, no lo duplica. */
export async function addFavourite(person: {
  tmdbId: number
  name: string
  photo?: string
}): Promise<string> {
  const existing = await getDb()
    .select()
    .from(peopleTable)
    .where(eq(peopleTable.tmdbId, person.tmdbId))
    .limit(1)
  if (existing[0]) return existing[0].id

  const row: Person = {
    id: newId(),
    tmdbId: person.tmdbId,
    name: person.name,
    photo: person.photo,
    addedAt: Date.now(),
  }
  await getDb().insert(peopleTable).values(personToRow(row))
  return row.id
}

export async function removeFavourite(tmdbId: number): Promise<void> {
  await getDb().delete(peopleTable).where(eq(peopleTable.tmdbId, tmdbId))
}

/** Marca o desmarca. Devuelve cómo queda. */
export async function toggleFavourite(person: {
  tmdbId: number
  name: string
  photo?: string
}): Promise<boolean> {
  if (await isFavourite(person.tmdbId)) {
    await removeFavourite(person.tmdbId)
    return false
  }
  await addFavourite(person)
  return true
}
