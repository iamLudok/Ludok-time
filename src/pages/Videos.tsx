import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { importVideos, deleteItem } from '../lib/library'
import { parseTakeout } from '../lib/youtube'
import { toast } from '../lib/toast'

const PAGE_SIZE = 60

function fecha(ts?: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function Videos() {
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const videos = useLiveQuery(
    () => db.items.where('type').equals('youtube').toArray(),
    [],
    [],
  )

  const all = (videos ?? []).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
  const q = query.trim().toLowerCase()
  const filtered = q
    ? all.filter(
        (v) => v.title.toLowerCase().includes(q) || (v.author ?? '').toLowerCase().includes(q),
      )
    : all
  const shown = filtered.slice(0, limit)

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const entries = parseTakeout(text)
      if (entries.length === 0) {
        toast('No he encontrado vídeos en ese fichero')
        return
      }
      const res = await importVideos(entries)
      toast(`Importados ${res.added} vídeos (${res.skipped} ya estaban)`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al importar')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const remove = async (id: string, title: string) => {
    if (!confirm(`¿Quitar "${title}"?`)) return
    await deleteItem(id)
  }

  return (
    <div>
      <h2 className="page-title">Vídeos</h2>

      <section className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Importar historial de YouTube</h3>
        <p className="muted" style={{ fontSize: '0.86rem' }}>
          En{' '}
          <a
            href="https://takeout.google.com/"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--accent-2)' }}
          >
            Google Takeout
          </a>{' '}
          elige solo <strong>YouTube → historial</strong> en formato <strong>JSON</strong>. Luego
          sube aquí el fichero <code>watch-history.json</code>.
        </p>
        <button className="btn btn-primary" disabled={importing} onClick={() => fileRef.current?.click()}>
          {importing ? 'Importando…' : '⬆️ Subir watch-history.json'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={onFile}
          style={{ display: 'none' }}
        />
        <p className="muted" style={{ fontSize: '0.78rem', marginBottom: 0 }}>
          Se ignoran anuncios y vídeos borrados. Los repetidos no se duplican.
        </p>
      </section>

      {all.length === 0 ? (
        <div className="empty">
          <div className="big">▶️</div>
          <p>Aún no tienes vídeos guardados.</p>
          <Link to="/search" className="btn btn-primary">
            Añadir uno
          </Link>
        </div>
      ) : (
        <>
          <div className="row spread" style={{ marginBottom: 12 }}>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setLimit(PAGE_SIZE)
              }}
              placeholder={`Buscar entre ${all.length} vídeos…`}
            />
          </div>

          <p className="muted" style={{ fontSize: '0.82rem' }}>
            {filtered.length} vídeo{filtered.length === 1 ? '' : 's'}
            {q ? ' encontrados' : ''}
          </p>

          <div className="stack">
            {shown.map((v) => (
              <div className="search-result" key={v.id}>
                {v.poster ? (
                  <img src={v.poster} alt="" loading="lazy" style={{ width: 96, height: 54 }} />
                ) : (
                  <div className="thumb" style={{ width: 96, height: 54 }}>
                    ▶️
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    {v.url ? (
                      <a href={v.url} target="_blank" rel="noreferrer">
                        {v.title}
                      </a>
                    ) : (
                      v.title
                    )}
                  </div>
                  <div className="muted" style={{ fontSize: '0.78rem' }}>
                    {v.author ? `${v.author} · ` : ''}
                    {fecha(v.completedAt)}
                  </div>
                </div>
                <button
                  className="btn btn-sm"
                  onClick={() => remove(v.id, v.title)}
                  aria-label="Quitar"
                  title="Quitar"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {shown.length < filtered.length && (
            <button
              className="btn btn-block"
              style={{ marginTop: 14 }}
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
            >
              Ver más ({filtered.length - shown.length} restantes)
            </button>
          )}
        </>
      )}
    </div>
  )
}
