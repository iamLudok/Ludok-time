// Núcleo de las copias de seguridad: solo consultas Drizzle, sin nada nativo.
//
// Está separado de `backup.ts` a propósito. Aquí no se importa expo-file-system
// ni expo-sqlite, así que este código se puede ejecutar tal cual en Node contra
// un SQLite de escritorio para probarlo. Como recibe la base de datos por
// parámetro, el test ejecuta EXACTAMENTE el mismo código que corre en el móvil,
// que es lo único que hace que la prueba valga para algo.
import { eq } from 'drizzle-orm'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import {
  items as itemsTable,
  episodes as episodesTable,
  pastWatches as pastWatchesTable,
  people as peopleTable,
  settings as settingsTable,
} from './schema'
import {
  rowToItem,
  rowToEpisode,
  rowToPastWatch,
  rowToPerson,
  rowToSettings,
  itemToRow,
  episodeToRow,
  pastWatchToRow,
  personToRow,
  settingsToRow,
} from './rows'
import { chunk, excludedSet } from './sqlHelpers'
import { SCHEMA_VERSION } from './version'
import type { BackupFile, Settings } from '../types'

export { SCHEMA_VERSION }

/** Cualquier base de datos SQLite de Drizzle (expo-sqlite en el móvil, better-sqlite3 en los tests). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LudokDb = BaseSQLiteDatabase<any, any, any>

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  tmdbApiKey: '',
  googleBooksApiKey: '',
  theme: 'system',
  lastBackup: 0,
  schemaVersion: SCHEMA_VERSION,
}

export async function readSettings(database: LudokDb): Promise<Settings> {
  const rows = await database
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.id, 'app'))
    .limit(1)
  // Se reutiliza `rowToSettings` en vez de repetir aquí el mapeo: tenerlo dos
  // veces ya provocó que campos nuevos se leyeran en un sitio y en el otro no.
  return rows[0] ? rowToSettings(rows[0]) : DEFAULT_SETTINGS
}

export async function writeSettings(database: LudokDb, next: Settings): Promise<void> {
  const row = settingsToRow(next)
  await database
    .insert(settingsTable)
    .values(row)
    .onConflictDoUpdate({ target: settingsTable.id, set: row })
}

/** Serializa toda la base de datos a un objeto de copia. */
export async function exportAll(database: LudokDb): Promise<BackupFile> {
  const itemRows = await database.select().from(itemsTable)
  const episodeRows = await database.select().from(episodesTable)
  const peopleRows = await database.select().from(peopleTable)
  const pastRows = await database.select().from(pastWatchesTable)
  const appSettings = await readSettings(database)

  // La contraseña de Nextcloud NO se exporta. Una copia se comparte y se mueve
  // de sitio, y esa contraseña da permiso de ESCRITURA sobre tus ficheros; la
  // propia copia acaba subida ahí, así que además viajaría con su propia llave
  // dentro. Al restaurar en otro móvil hay que volver a escribirla, y punto.
  const { nextcloudPassword: _omitted, ...safeSettings } = appSettings

  return {
    app: 'ludok-time',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    items: itemRows.map(rowToItem),
    episodes: episodeRows.map(rowToEpisode),
    people: peopleRows.map(rowToPerson),
    pastWatches: pastRows.map(rowToPastWatch),
    settings: safeSettings,
  }
}

export interface ImportResult {
  items: number
  episodes: number
  /** Actores favoritos restaurados. */
  people: number
  /** Marcas de visionados anteriores restauradas. */
  pastWatches: number
  /** Vídeos de YouTube descartados por venir de una copia anterior a quitarlos. */
  discardedVideos: number
}

/**
 * Importa una copia. 'replace' vacía antes lo que haya; 'merge' añade/actualiza
 * por id sin borrar nada. Todo dentro de una transacción: si algo falla a mitad
 * no se queda la base de datos a medias.
 */
export async function importBackup(
  database: LudokDb,
  raw: string,
  mode: 'replace' | 'merge' = 'replace',
): Promise<ImportResult> {
  let parsed: BackupFile
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('El fichero no es un JSON válido.')
  }
  if (parsed.app !== 'ludok-time' || !Array.isArray(parsed.items)) {
    throw new Error('Esto no parece una copia de Ludok Time.')
  }
  if (parsed.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `La copia es de una versión más nueva (v${parsed.schemaVersion}). Actualiza la app antes de importar.`,
    )
  }

  // Los vídeos de YouTube se quitaron de la app. Una copia anterior puede
  // traerlos: se descartan y se dice cuántos, en vez de meterlos en la base de
  // datos como filas de un tipo que ya no existe y que nada sabría mostrar.
  const all = parsed.items ?? []
  const incomingItems = all.filter((i) => (i.type as string) !== 'youtube')
  const discardedVideos = all.length - incomingItems.length
  const incomingEpisodes = parsed.episodes ?? []
  // Ausente en copias anteriores a los favoritos: se trata como lista vacía.
  const incomingPeople = parsed.people ?? []
  const incomingPast = parsed.pastWatches ?? []

  await database.transaction(async (tx: LudokDb) => {
    if (mode === 'replace') {
      await tx.delete(episodesTable)
      await tx.delete(pastWatchesTable)
      await tx.delete(itemsTable)
      await tx.delete(peopleTable)
    }
    for (const part of chunk(incomingItems)) {
      await tx
        .insert(itemsTable)
        .values(part.map(itemToRow))
        .onConflictDoUpdate({ target: itemsTable.id, set: excludedSet(itemsTable) })
    }
    for (const part of chunk(incomingEpisodes)) {
      await tx
        .insert(episodesTable)
        .values(part.map(episodeToRow))
        .onConflictDoUpdate({ target: episodesTable.id, set: excludedSet(episodesTable) })
    }
    for (const part of chunk(incomingPeople)) {
      await tx
        .insert(peopleTable)
        .values(part.map(personToRow))
        .onConflictDoUpdate({ target: peopleTable.id, set: excludedSet(peopleTable) })
    }
    for (const part of chunk(incomingPast)) {
      await tx
        .insert(pastWatchesTable)
        .values(part.map(pastWatchToRow))
        .onConflictDoUpdate({ target: pastWatchesTable.id, set: excludedSet(pastWatchesTable) })
    }
  })

  // Las claves y las preferencias se restauran, pero se conserva la
  // schemaVersion actual. La contraseña de Nextcloud no viene en la copia (no
  // se exporta), así que se mantiene la que ya hubiera en este móvil.
  if (parsed.settings) {
    const current = await readSettings(database)
    await writeSettings(database, {
      ...current,
      tmdbApiKey: parsed.settings.tmdbApiKey || current.tmdbApiKey,
      googleBooksApiKey: parsed.settings.googleBooksApiKey || current.googleBooksApiKey,
      theme: parsed.settings.theme || current.theme,
      nextcloudUrl: parsed.settings.nextcloudUrl || current.nextcloudUrl,
      nextcloudUser: parsed.settings.nextcloudUser || current.nextcloudUser,
      nextcloudFolder: parsed.settings.nextcloudFolder || current.nextcloudFolder,
      autoBackup: parsed.settings.autoBackup ?? current.autoBackup,
      id: 'app',
    })
  }

  return {
    items: incomingItems.length,
    episodes: incomingEpisodes.length,
    people: incomingPeople.length,
    pastWatches: incomingPast.length,
    discardedVideos,
  }
}

/** Días transcurridos desde la última copia. Infinity si nunca se ha hecho. */
export function daysSinceBackup(lastBackup: number): number {
  if (!lastBackup) return Infinity
  return Math.floor((Date.now() - lastBackup) / 86_400_000)
}
