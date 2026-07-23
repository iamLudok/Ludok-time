import { useEffect, useRef, useState } from 'react'
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
  const [pendingFile, setPendingFile] = useState<File | null>(null)
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

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setPendingFile(file)
  }

  const cancelImport = () => {
    setPendingFile(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const doImport = async (mode: 'replace' | 'merge') => {
    if (!pendingFile) return
    setImporting(true)
    try {
      const text = await pendingFile.text()
      const res = await importBackup(text, mode)
      toast(`Importado: ${res.items} títulos, ${res.episodes} episodios`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al importar')
    } finally {
      setImporting(false)
      setPendingFile(null)
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

      {pendingFile && (
        <div className="modal-backdrop" onClick={cancelImport}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Importar copia</h3>
            <p className="muted" style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>
              {pendingFile.name}
            </p>
            <div className="stack">
              <button
                className="btn btn-primary btn-block"
                onClick={() => doImport('replace')}
                disabled={importing}
              >
                {importing ? '…' : '🔄 Reemplazar todo lo actual'}
              </button>
              <button
                className="btn btn-block"
                onClick={() => doImport('merge')}
                disabled={importing}
              >
                {importing ? '…' : '➕ Fusionar (añadir sin borrar)'}
              </button>
              <button className="btn btn-block" onClick={cancelImport} disabled={importing}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
