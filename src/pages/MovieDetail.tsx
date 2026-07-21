import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { setStatus, statusLabel } from '../lib/library'
import DetailControls from '../components/DetailControls'
import { toast } from '../lib/toast'

export default function MovieDetail() {
  const { id } = useParams<{ id: string }>()
  const item = useLiveQuery(() => (id ? db.items.get(id) : undefined), [id])

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

  const watched = item.status === 'completed'

  const toggleWatched = async () => {
    await setStatus(item.id, watched ? 'plan' : 'completed')
    toast(watched ? 'Marcada como pendiente' : '¡Vista! 🎬')
  }

  return (
    <div>
      <div className="detail-head">
        {item.poster ? (
          <img className="detail-poster" src={item.poster} alt={item.title} />
        ) : (
          <div className="detail-poster poster-fallback" style={{ position: 'static' }}>
            🎬
          </div>
        )}
        <div>
          <h2 style={{ margin: '0 0 6px' }}>{item.title}</h2>
          <div className="muted">
            {item.year} · Película{item.runtime ? ` · ${item.runtime} min` : ''}
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            <span className={'badge status-' + item.status}>{statusLabel(item.status)}</span>
          </div>
          <button
            className={'btn btn-sm ' + (watched ? '' : 'btn-primary')}
            style={{ marginTop: 10 }}
            onClick={toggleWatched}
          >
            {watched ? '✓ Vista (desmarcar)' : '▶ Marcar como vista'}
          </button>
        </div>
      </div>

      {item.overview && (
        <p className="muted" style={{ fontSize: '0.9rem' }}>
          {item.overview}
        </p>
      )}

      <DetailControls item={item} />
    </div>
  )
}
