import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { setEpisodeWatched } from '../lib/library'
import EpisodeList from '../components/EpisodeList'
import DetailControls from '../components/DetailControls'
import WhereToWatch from '../components/WhereToWatch'
import NextEpisodeCountdown from '../components/NextEpisodeCountdown'
import { toast } from '../lib/toast'
import type { Episode } from '../types'

export default function SeriesDetail() {
  const { id } = useParams<{ id: string }>()
  const item = useLiveQuery(() => (id ? db.items.get(id) : undefined), [id])
  const episodes = useLiveQuery(
    () => (id ? db.episodes.where('itemId').equals(id).toArray() : Promise.resolve([] as Episode[])),
    [id],
    [] as Episode[],
  )

  if (item === undefined) return <div className="empty">Cargando…</div>
  if (item === null || !item) {
    return (
      <div className="empty">
        <p>No encontrado.</p>
        <Link to="/" className="btn">
          Volver
        </Link>
      </div>
    )
  }

  const sorted = [...(episodes ?? [])].sort(
    (a, b) => a.season - b.season || a.episode - b.episode,
  )
  const watched = sorted.filter((e) => e.watched).length
  const total = sorted.length
  const nextEp = sorted.find((e) => !e.watched)

  const watchNext = async () => {
    if (!nextEp) return
    await setEpisodeWatched(nextEp.id, true)
    toast(`Visto S${nextEp.season}E${nextEp.episode}`)
  }

  return (
    <div>
      <div className="detail-head">
        {item.poster ? (
          <img className="detail-poster" src={item.poster} alt={item.title} />
        ) : (
          <div className="detail-poster poster-fallback" style={{ position: 'static' }}>
            📺
          </div>
        )}
        <div>
          <h2 style={{ margin: '0 0 6px' }}>{item.title}</h2>
          <div className="muted">{item.year} · Serie</div>
          <div className="muted" style={{ marginTop: 6 }}>
            {watched}/{total} episodios vistos
          </div>
          {nextEp && (
            <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={watchNext}>
              ▶ Ver siguiente: S{nextEp.season}E{nextEp.episode}
            </button>
          )}
        </div>
      </div>

      {item.source === 'tmdb' && item.sourceId && (
        <NextEpisodeCountdown
          itemId={item.id}
          tmdbId={Number(item.sourceId)}
          localEpisodes={sorted}
        />
      )}

      {item.overview && (
        <p className="muted" style={{ fontSize: '0.9rem' }}>
          {item.overview}
        </p>
      )}

      {item.source === 'tmdb' && item.sourceId && (
        <WhereToWatch tmdbId={Number(item.sourceId)} kind="tv" />
      )}

      <DetailControls item={item} />

      <h3 style={{ marginTop: 24 }}>Episodios</h3>
      {total === 0 ? (
        <p className="muted">No hay episodios cargados para esta serie.</p>
      ) : (
        <EpisodeList itemId={item.id} episodes={sorted} />
      )}
    </div>
  )
}
