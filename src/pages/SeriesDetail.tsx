import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { setEpisodeWatched, updateItem } from '../lib/library'
import { getSeries, type TmdbSeries } from '../lib/tmdb'
import EpisodeList from '../components/EpisodeList'
import DetailControls from '../components/DetailControls'
import WatchedDate from '../components/WatchedDate'
import WhereToWatch from '../components/WhereToWatch'
import NextEpisodeCountdown from '../components/NextEpisodeCountdown'
import SimilarTitles from '../components/SimilarTitles'
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

  // Un solo fetch en vivo a TMDB, compartido por el countdown de próximo
  // episodio y por "También te puede gustar" (antes cada uno pedía lo suyo).
  const tmdbId = item?.source === 'tmdb' && item.sourceId ? Number(item.sourceId) : undefined
  const [tmdbData, setTmdbData] = useState<TmdbSeries | null | undefined>(undefined)

  useEffect(() => {
    if (!tmdbId) {
      setTmdbData(null)
      return
    }
    let alive = true
    setTmdbData(undefined)
    getSeries(tmdbId)
      .then((s) => alive && setTmdbData(s))
      .catch(() => alive && setTmdbData(null))
    return () => {
      alive = false
    }
  }, [tmdbId])

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
          {item.status === 'completed' && (
            <div style={{ marginTop: 6 }}>
              <WatchedDate
                timestamp={item.completedAt}
                label="Completada"
                onChange={(ts) => updateItem(item.id, { completedAt: ts })}
              />
            </div>
          )}
        </div>
      </div>

      {tmdbId && (
        <NextEpisodeCountdown
          itemId={item.id}
          localEpisodes={sorted}
          series={
            tmdbData === undefined
              ? undefined
              : tmdbData === null
                ? null
                : { inProduction: tmdbData.inProduction, nextEpisode: tmdbData.nextEpisode }
          }
        />
      )}

      {item.overview && (
        <p className="muted" style={{ fontSize: '0.9rem' }}>
          {item.overview}
        </p>
      )}

      {tmdbId && <WhereToWatch tmdbId={tmdbId} kind="tv" />}

      {tmdbId && (
        <SimilarTitles tmdbId={tmdbId} kind="tv" originalLanguage={tmdbData?.originalLanguage} />
      )}

      <DetailControls item={item} />

      <h3 style={{ marginTop: 24 }}>Episodios</h3>
      {total === 0 ? (
        <p className="muted">No hay episodios cargados para esta serie.</p>
      ) : (
        <EpisodeList key={item.id} itemId={item.id} episodes={sorted} />
      )}
    </div>
  )
}
