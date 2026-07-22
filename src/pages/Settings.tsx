import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSettings, updateSettings } from '../lib/settings'
import { downloadBackup, importBackup, daysSinceBackup } from '../lib/backup'
import { getStorageInfo, requestPersistentStorage, type StorageInfo } from '../lib/persistence'
import { toast } from '../lib/toast'

function fmtBytes(n?: number): string {
  if (!n) return '—'
  const mb = n / (1024 * 1024)
  if (mb < 1) return `${Math.round(n / 1024)} KB`
  return `${mb.toFixed(1)} MB`
}

export default function SettingsPage() {
  const settings = useSettings()
  const [apiKey, setApiKey] = useState('')
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => setApiKey(settings.tmdbApiKey), [settings.tmdbApiKey])
  useEffect(() => {
    getStorageInfo().then(setStorage)
  }, [])

  const saveKey = () => {
    updateSettings({ tmdbApiKey: apiKey.trim() })
    toast('API key guardada')
  }

  const doExport = async () => {
    try {
      await downloadBackup()
      toast('Copia guardada ✅')
    } catch {
      toast('No se pudo crear la copia')
    }
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const mode = confirm(
      'Importar copia:\n\n"Aceptar" = REEMPLAZAR todo lo actual por la copia.\n"Cancelar" = FUSIONAR (añadir sin borrar lo existente).',
    )
      ? 'replace'
      : 'merge'
    setImporting(true)
    try {
      const text = await file.text()
      const res = await importBackup(text, mode)
      toast(`Importado: ${res.items} títulos, ${res.episodes} episodios`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al importar')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const enablePersist = async () => {
    const ok = await requestPersistentStorage()
    setStorage(await getStorageInfo())
    toast(ok ? 'Almacenamiento persistente activo' : 'El navegador no lo concedió')
  }

  const days = daysSinceBackup(settings.lastBackup)

  return (
    <div className="stack">
      <h2 className="page-title">Ajustes</h2>

      {/* Copia de seguridad — lo más importante */}
      <section className="card">
        <h3 style={{ marginTop: 0 }}>🛟 Copia de seguridad</h3>
        <p className="muted" style={{ fontSize: '0.88rem' }}>
          Tus datos viven solo en este dispositivo. Exporta a menudo y guarda el fichero en tu nube
          o en Archivos para no perderlo nunca.
        </p>
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Última copia:{' '}
          {settings.lastBackup
            ? days === 0
              ? 'hoy'
              : `hace ${days} día${days === 1 ? '' : 's'}`
            : 'nunca'}
        </p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={doExport}>
            ⬇️ Exportar copia
          </button>
          <button
            className="btn"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
          >
            {importing ? '…' : '⬆️ Importar copia'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={onFile}
            style={{ display: 'none' }}
          />
        </div>
      </section>

      {/* Puesta al día */}
      <section className="card">
        <h3 style={{ marginTop: 0 }}>📥 Puesta al día</h3>
        <p className="muted" style={{ fontSize: '0.88rem' }}>
          El <Link to="/timeline" style={{ color: 'var(--accent-2)' }}>Diario</Link> es un
          registro de qué has visto o leído <strong>y cuándo</strong>. Si vas a marcar de golpe
          episodios, pelis o libros que ya viste <em>antes</em> de usar esta app (recuperando tu
          historial de TV Time, por ejemplo), actívalo: mientras esté encendido, marcar algo como
          visto guarda el progreso pero <strong>no</strong> escribe en el diario. Actualiza el
          progreso y el estado con normalidad.
        </p>
        <label className="row" style={{ gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={settings.catchUpMode}
            onChange={(e) => updateSettings({ catchUpMode: e.target.checked })}
          />
          <span>{settings.catchUpMode ? 'Activado: no se registra nada en el diario' : 'Desactivado'}</span>
        </label>
      </section>

      {/* Almacenamiento */}
      <section className="card">
        <h3 style={{ marginTop: 0 }}>💾 Almacenamiento</h3>
        {storage ? (
          <>
            <p className="muted" style={{ fontSize: '0.88rem' }}>
              Persistente:{' '}
              <strong style={{ color: storage.persisted ? 'var(--ok)' : 'var(--warn)' }}>
                {storage.persisted ? 'sí ✅' : 'no ⚠️'}
              </strong>
              {' · '}Uso: {fmtBytes(storage.usageBytes)}
            </p>
            {!storage.persisted && (
              <button className="btn btn-sm" onClick={enablePersist}>
                Intentar activar persistencia
              </button>
            )}
          </>
        ) : (
          <span className="spin" />
        )}
      </section>

      {/* TMDB */}
      <section className="card">
        <h3 style={{ marginTop: 0 }}>🎬 API de TMDB</h3>
        <p className="muted" style={{ fontSize: '0.88rem' }}>
          Necesaria para buscar series y películas. Es gratis: crea una cuenta en{' '}
          <a
            href="https://www.themoviedb.org/settings/api"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--accent-2)' }}
          >
            themoviedb.org
          </a>{' '}
          y copia tu <em>API Key (v3 auth)</em>.
        </p>
        <div className="field">
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Pega aquí tu API key de TMDB"
          />
        </div>
        <button className="btn btn-primary" onClick={saveKey}>
          Guardar API key
        </button>
      </section>

      {/* Tema */}
      <section className="card">
        <h3 style={{ marginTop: 0 }}>🎨 Tema</h3>
        <div className="chip-row">
          {(['system', 'dark', 'light'] as const).map((t) => (
            <button
              key={t}
              className={'chip' + (settings.theme === t ? ' active' : '')}
              onClick={() => updateSettings({ theme: t })}
            >
              {t === 'system' ? 'Sistema' : t === 'dark' ? 'Oscuro' : 'Claro'}
            </button>
          ))}
        </div>
      </section>

      <p className="muted" style={{ textAlign: 'center', fontSize: '0.8rem' }}>
        Ludok Time · tus datos, tuyos.
      </p>
    </div>
  )
}
