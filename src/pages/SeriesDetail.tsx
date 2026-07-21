import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { setEpisodeWatched, isAnime, updateItem, ANIME_TAG } from '../lib/library'
import EpisodeList from '../components/EpisodeList'
import DetailControls from '../components/DetailControls'
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

  const anime = isAnime(item)
  const toggleAnime = async () => {
    const tags = anime
      ? item.tags.filter((t) => t !== ANIME_TAG)
      : [...item.tags, ANIME_TAG]
    await updateItem(item.id, { tags })
    toast(anime ? 'Ya no es anime' : 'Marcada como anime 🌸')
  }

  return (
    <div>
      <div className="detail-head">
        {item.poster ? (
          <img className="detail-poster" src={item.poster} alt={item.title} />
        ) : (
          <div className="detail-poster poster-fallback" style={{ position: 'static' }}>
            {anime ? '🌸' : '📺'}
          </div>
        )}
        <div>
          <h2 style={{ margin: '0 0 6px' }}>{item.title}</h2>
          <div className="muted">
            {item.year} · {anime ? 'Anime' : 'Serie'}
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            {watched}/{total} episodios vistos
          </div>
          <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
            {nextEp && (
              <button className="btn btn-primary btn-sm" onClick={watchNext}>
                ▶ Ver siguiente: S{nextEp.season}E{nextEp.episode}
              </button>
            )}
            <button
              className={'chip btn-sm' + (anime ? ' active' : '')}
              onClick={toggleAnime}
              title="Marcar/quitar la etiqueta anime"
            >
              🌸 {anime ? 'Es anime' : 'Marcar como anime'}
            </button>
          </div>
        </div>
      </div>

      {item.overview && (
        <p className="muted" style={{ fontSize: '0.9rem' }}>
          {item.overview}
        </p>
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
