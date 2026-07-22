import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { setBookProgress, bookPercent, statusLabel, updateItem } from '../lib/library'
import DetailControls from '../components/DetailControls'
import { toast } from '../lib/toast'

export default function BookDetail() {
  const { id } = useParams<{ id: string }>()
  const item = useLiveQuery(() => (id ? db.items.get(id) : undefined), [id])

  const [page, setPage] = useState('')
  const [total, setTotal] = useState('')

  useEffect(() => {
    if (!item) return
    setPage(String(item.currentPage ?? 0))
    setTotal(item.totalPages ? String(item.totalPages) : '')
  }, [item?.id])

  if (item === undefined) return <div className="empty">Cargando…</div>
  if (!item) {
    return (
      <div className="empty">
        <p>No encontrado.</p>
        <Link to="/" className="btn">
          Volver
        </Link>
      </div>
    )
  }

  const percent = bookPercent(item)

  const savePage = async () => {
    const n = parseInt(page, 10)
    if (!Number.isFinite(n) || n < 0) return
    await setBookProgress(item.id, n)
    toast(`Vas por la página ${n}`)
  }

  const saveTotal = async () => {
    const n = parseInt(total, 10)
    if (!Number.isFinite(n) || n <= 0) return
    await updateItem(item.id, { totalPages: n })
    // Recalcula el estado con el nuevo total.
    await setBookProgress(item.id, item.currentPage ?? 0)
  }

  const finish = async () => {
    if (!item.totalPages) return
    await setBookProgress(item.id, item.totalPages)
    setPage(String(item.totalPages))
    toast('¡Libro terminado! 📖')
  }

  return (
    <div>
      <div className="detail-head">
        {item.poster ? (
          <img className="detail-poster" src={item.poster} alt={item.title} />
        ) : (
          <div className="detail-poster poster-fallback" style={{ position: 'static' }}>
            📖
          </div>
        )}
        <div>
          <h2 style={{ margin: '0 0 6px' }}>{item.title}</h2>
          <div className="muted">
            {item.author ?? 'Autor desconocido'}
            {item.year ? ` · ${item.year}` : ''}
          </div>
          <div style={{ marginTop: 6 }}>
            <span className={'badge status-' + item.status}>
              {statusLabel(item.status, 'book')}
            </span>
          </div>
        </div>
      </div>

      <section className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>Progreso de lectura</h3>

        {item.totalPages ? (
          <>
            <div className="row spread" style={{ marginBottom: 6 }}>
              <span className="muted">
                Página {item.currentPage ?? 0} de {item.totalPages}
              </span>
              <strong>{percent}%</strong>
            </div>
            <div className="progress" style={{ marginBottom: 14 }}>
              <span style={{ width: `${percent}%` }} />
            </div>
          </>
        ) : (
          <p className="muted" style={{ fontSize: '0.88rem' }}>
            No sabemos cuántas páginas tiene. Escríbelo abajo para ver el porcentaje.
          </p>
        )}

        <div className="field">
          <label className="label">¿Por qué página vas?</label>
          <div className="row">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={item.totalPages}
              value={page}
              onChange={(e) => setPage(e.target.value)}
              onBlur={savePage}
            />
            <button className="btn btn-primary" onClick={savePage}>
              Guardar
            </button>
          </div>
        </div>

        <div className="field">
          <label className="label">Páginas totales</label>
          <div className="row">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              onBlur={saveTotal}
              placeholder="p. ej. 592"
            />
            <button className="btn" onClick={saveTotal}>
              Guardar
            </button>
          </div>
        </div>

        {item.totalPages && item.status !== 'completed' && (
          <button className="btn btn-primary btn-block" onClick={finish}>
            ✓ Marcar como terminado
          </button>
        )}
      </section>

      <DetailControls item={item} />
    </div>
  )
}
