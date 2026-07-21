import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useSettings } from '../lib/settings'
import { daysSinceBackup, downloadBackup } from '../lib/backup'
import { toast } from '../lib/toast'

/**
 * Aviso persistente cuando llevas mucho sin copia de seguridad.
 * Es la red de seguridad principal contra perder datos.
 */
export default function BackupBanner() {
  const settings = useSettings()
  const itemCount = useLiveQuery(() => db.items.count(), [], 0) ?? 0
  const [busy, setBusy] = useState(false)

  // Sin datos aún: nada que respaldar.
  if (itemCount === 0) return null

  const days = daysSinceBackup(settings.lastBackup)
  const never = days === Infinity
  // Solo molestamos si nunca has hecho copia o hace más de 7 días.
  if (!never && days < 7) return null

  const doBackup = async () => {
    setBusy(true)
    try {
      await downloadBackup()
      toast('Copia guardada ✅')
    } catch {
      toast('No se pudo crear la copia')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={'banner' + (never ? ' danger' : '')}>
      <span>
        {never
          ? '⚠️ Aún no has hecho ninguna copia de seguridad. Guárdala para no perder tus datos.'
          : `⏳ Llevas ${days} días sin copia de seguridad.`}
      </span>
      <button className="btn btn-sm btn-primary" onClick={doBackup} disabled={busy}>
        {busy ? '…' : 'Hacer copia'}
      </button>
    </div>
  )
}
