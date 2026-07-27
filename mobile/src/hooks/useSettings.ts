import { eq } from 'drizzle-orm'
import { useLiveQuery } from 'drizzle-orm/expo-sqlite'
import { db } from '../lib/db'
import { settings as settingsTable } from '../lib/schema'
import { rowToSettings } from '../lib/rows'
import { DEFAULT_SETTINGS } from '../lib/backupCore'
import type { Settings } from '../types'

/**
 * Hook reactivo con los ajustes actuales (o los por defecto mientras carga).
 * Está aquí y no en `lib/settings.ts` porque `useLiveQuery` es de expo-sqlite y
 * solo funciona en el móvil; así la lógica de ajustes sigue siendo probable.
 */
export function useSettings(): Settings {
  const { data } = useLiveQuery(
    db.select().from(settingsTable).where(eq(settingsTable.id, 'app')),
  )
  return data?.[0] ? rowToSettings(data[0]) : DEFAULT_SETTINGS
}
