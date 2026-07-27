// Núcleo de las copias de seguridad: solo consultas Drizzle, sin nada nativo.
//
// Está separado de `backup.ts` a propósito. Aquí no se importa expo-file-system
// ni expo-sqlite, así que este código se puede ejecutar tal cual en Node contra
// un SQLite de escritorio para probarlo. Como recibe la base de datos por
// parámetro, el test ejecuta EXACTAMENTE el mismo código que corre en el móvil,
// que es lo único que hace que la prueba valga para algo.
import { eq } from 'drizzle-orm'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import { items as itemsTable, episodes as episodesTable, settings as settingsTable } from './schema'
import { rowToItem, rowToEpisode, itemToRow, episodeToRow, settingsToRow } from './rows'
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
  const row = rows[0]
  if (!row) return DEFAULT_SETTINGS
  return {
    id: 'app',
    tmdbApiKey: row.tmdbApiKey,
    googleBooksApiKey: row.googleBooksApiKey ?? undefined,
    theme: row.theme,
    lastBackup: row.lastBackup,
    schemaVersion: row.schemaVersion,
  }
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
  const appSettings = await readSettings(database)
  return {
    app: 'ludok-time',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    items: itemRows.map(rowToItem),
    episodes: episodeRows.map(rowToEpisode),
    settings: appSettings,
  }
}

export interface ImportResult {
  items: number
  episodes: number
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

  const incomingItems = parsed.items ?? []
  const incomingEpisodes = parsed.episodes ?? []

  await database.transaction(async (tx: LudokDb) => {
    if (mode === 'replace') {
      await tx.delete(episodesTable)
      await tx.delete(itemsTable)
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
  })

  // La API key y el tema se restauran, pero se conserva la schemaVersion actual.
  if (parsed.settings) {
    const current = await readSettings(database)
    await writeSettings(database, {
      ...current,
      tmdbApiKey: parsed.settings.tmdbApiKey || current.tmdbApiKey,
      googleBooksApiKey: parsed.settings.googleBooksApiKey || current.googleBooksApiKey,
      theme: parsed.settings.theme || current.theme,
      id: 'app',
    })
  }

  return { items: incomingItems.length, episodes: incomingEpisodes.length }
}

/** Días transcurridos desde la última copia. Infinity si nunca se ha hecho. */
export function daysSinceBackup(lastBackup: number): number {
  if (!lastBackup) return Infinity
  return Math.floor((Date.now() - lastBackup) / 86_400_000)
}
