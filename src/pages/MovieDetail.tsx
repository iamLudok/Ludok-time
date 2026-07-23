import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { setStatus, statusLabel, updateItem } from '../lib/library'
import { getMovie } from '../lib/tmdb'
import DetailControls from '../components/DetailControls'
import WatchedDate from '../components/WatchedDate'
import WhereToWatch from '../components/WhereToWatch'
import SimilarTitles from '../components/SimilarTitles'
import { toast } from '../lib/toast'

export default function MovieDetail() {
  const { id } = useParams<{ id: string }>()
  const item = useLiveQuery(() => (id ? db.items.get(id) : undefined), [id])

  const tmdbId = item?.source === 'tmdb' && item.sourceId ? Number(item.sourceId) : undefined
  const [originalLanguage, setOriginalLanguage] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!tmdbId) return
    let alive = true
    getMovie(tmdbId)
      .then((m) => alive && setOriginalLanguage(m.originalLanguage))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [tmdbId])

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
          {watched && (
            <div style={{ marginTop: 6 }}>
              <WatchedDate
                timestamp={item.completedAt}
                onChange={(ts) => updateItem(item.id, { completedAt: ts })}
              />
            </div>
          )}
        </div>
      </div>

      {item.overview && (
        <p className="muted" style={{ fontSize: '0.9rem' }}>
          {item.overview}
        </p>
      )}

      {tmdbId && <WhereToWatch tmdbId={tmdbId} kind="movie" />}

      {tmdbId && (
        <SimilarTitles tmdbId={tmdbId} kind="movie" originalLanguage={originalLanguage} />
      )}

      <DetailControls item={item} />
    </div>
  )
}
