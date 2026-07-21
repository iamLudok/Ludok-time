import { db, SCHEMA_VERSION } from './db'
import { getSettings, updateSettings } from './settings'
import type { BackupFile } from '../types'

/** Serializa TODA la base de datos a un objeto de copia. */
export async function exportAll(): Promise<BackupFile> {
  const [items, episodes, activity, settings] = await Promise.all([
    db.items.toArray(),
    db.episodes.toArray(),
    db.activity.toArray(),
    getSettings(),
  ])
  return {
    app: 'ludok-time',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    items,
    episodes,
    activity,
    settings,
  }
}

function backupFilename(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `ludok-time-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`
}

/**
 * Descarga la copia como fichero. En móviles con Web Share API intenta abrir
 * el diálogo de compartir (para guardarla en Archivos/Nextcloud/Drive);
 * si falla, cae a una descarga normal.
 */
export async function downloadBackup(): Promise<void> {
  const data = await exportAll()
  const json = JSON.stringify(data, null, 2)
  const filename = backupFilename()
  const blob = new Blob([json], { type: 'application/json' })

  const file = new File([blob], filename, { type: 'application/json' })
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Copia de Ludok Time' })
      await updateSettings({ lastBackup: Date.now() })
      return
    } catch (err) {
      // El usuario canceló o no se pudo compartir: caemos a descarga.
      if (err instanceof DOMException && err.name === 'AbortError') return
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  await updateSettings({ lastBackup: Date.now() })
}

export interface ImportResult {
  items: number
  episodes: number
  activity: number
}

/**
 * Importa una copia. Modo 'replace' vacía la base antes; 'merge' añade/actualiza
 * por id sin borrar lo que ya haya.
 */
export async function importBackup(
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

  await db.transaction('rw', db.items, db.episodes, db.activity, db.settings, async () => {
    if (mode === 'replace') {
      await Promise.all([db.items.clear(), db.episodes.clear(), db.activity.clear()])
    }
    if (parsed.items?.length) await db.items.bulkPut(parsed.items)
    if (parsed.episodes?.length) await db.episodes.bulkPut(parsed.episodes)
    if (parsed.activity?.length) await db.activity.bulkPut(parsed.activity)
    // Restauramos la API key y el tema, pero conservamos schemaVersion actual.
    if (parsed.settings) {
      const current = await getSettings()
      await db.settings.put({
        ...current,
        tmdbApiKey: parsed.settings.tmdbApiKey || current.tmdbApiKey,
        theme: parsed.settings.theme || current.theme,
        id: 'app',
      })
    }
  })

  return {
    items: parsed.items?.length ?? 0,
    episodes: parsed.episodes?.length ?? 0,
    activity: parsed.activity?.length ?? 0,
  }
}

/** Días transcurridos desde la última copia. Infinity si nunca se ha hecho. */
export function daysSinceBackup(lastBackup: number): number {
  if (!lastBackup) return Infinity
  return Math.floor((Date.now() - lastBackup) / 86_400_000)
}
