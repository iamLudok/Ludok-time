import { useLiveQuery } from 'dexie-react-hooks'
import { db, SCHEMA_VERSION } from './db'
import type { Settings } from '../types'

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  tmdbApiKey: '',
  theme: 'system',
  lastBackup: 0,
  schemaVersion: SCHEMA_VERSION,
}

/**
 * Lectura SOLO. Devuelve los ajustes guardados o los por defecto (sin escribir).
 * Seguro para usar dentro de useLiveQuery (que corre en transacción de solo lectura).
 */
export async function getSettings(): Promise<Settings> {
  const existing = await db.settings.get('app')
  return existing ?? DEFAULT_SETTINGS
}

/** Persiste los ajustes por defecto si aún no existen. Llamar una vez al arrancar. */
export async function ensureSettings(): Promise<void> {
  const existing = await db.settings.get('app')
  if (!existing) await db.settings.put(DEFAULT_SETTINGS)
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, id: 'app' })
}

/** Hook reactivo con los ajustes actuales (o los por defecto mientras carga). */
export function useSettings(): Settings {
  return useLiveQuery(() => db.settings.get('app'), [], undefined) ?? DEFAULT_SETTINGS
}
