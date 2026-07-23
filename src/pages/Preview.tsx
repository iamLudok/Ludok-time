import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { getSeries, getMovie, posterUrl, type TmdbSeries, type TmdbMovie } from '../lib/tmdb'
import { addSeriesFromTmdb, addMovieFromTmdb } from '../lib/library'
import WhereToWatch from '../components/WhereToWatch'
import SimilarTitles from '../components/SimilarTitles'
import { toast } from '../lib/toast'

/**
 * Vista previa de una serie/película de TMDB SIN añadirla a la biblioteca:
 * temporadas, episodios por temporada, sinopsis y dónde verla. Nada se
 * guarda hasta que se pulsa "Añadir".
 */
export default function Preview() {
  const { kind, tmdbId } = useParams<{ kind: string; tmdbId: string }>()
  const navigate = useNavigate()
  const isSeries = kind === 'tv'
  const id = Number(tmdbId)

  const [data, setData] = useState<TmdbSeries | TmdbMovie | null | undefined>(undefined)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    setData(undefined)
    const fetcher = isSeries ? getSeries(id) : getMovie(id)
    fetcher.then(setData).catch(() => setData(null))
  }, [id, isSeries])

  // ¿Ya lo tienes en la biblioteca? (source no está indexado: filtramos en JS)
  const existing = useLiveQuery(
    () =>
      db.items
        .toArray()
        .then((items) =>
          items.find(
            (i) =>
              i.source === 'tmdb' &&
              i.sourceId === String(id) &&
              i.type === (isSeries ? 'series' : 'movie'),
          ),
        ),
    [id, isSeries],
  )

  if (!tmdbId || Number.isNaN(id)) {
    return (
      <div className="empty">
        <p>Título no válido.</p>
        <Link to="/search" className="btn">
          Volver a buscar
        </Link>
      </div>
    )
  }

  if (data === undefined) {
    return (
      <div className="empty">
        <span className="spin" />
      </div>
    )
  }

  if (data === null) {
    return (
      <div className="empty">
        <p>No se pudo cargar este título.</p>
        <Link to="/search" className="btn">
          Volver a buscar
        </Link>
      </div>
    )
  }

  const series = isSeries ? (data as TmdbSeries) : null
  const movie = !isSeries ? (data as TmdbMovie) : null
  const totalEpisodes = series?.seasons.reduce((sum, s) => sum + s.episodeCount, 0) ?? 0

  const add = async () => {
    setAdding(true)
    try {
      const localId = isSeries ? await addSeriesFromTmdb(id, 'plan') : await addMovieFromTmdb(id, 'movie', 'plan')
      toast(`Añadido: ${data.title}`)
      navigate(isSeries ? `/series/${localId}` : `/movie/${localId}`)
    } catch {
      toast('No se pudo añadir')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div>
      <div className="detail-head">
        {data.posterPath ? (
          <img className="detail-poster" src={posterUrl(data.posterPath, 'w342')} alt={data.title} />
        ) : (
          <div className="detail-poster poster-fallback" style={{ position: 'static' }}>
            {isSeries ? '📺' : '🎬'}
          </div>
        )}
        <div>
          <h2 style={{ margin: '0 0 6px' }}>{data.title}</h2>
          <div className="muted">
            {data.year} · {isSeries ? 'Serie' : 'Película'}
            {movie?.runtime ? ` · ${movie.runtime} min` : ''}
          </div>
          {series && (
            <div className="muted" style={{ marginTop: 6 }}>
              {series.seasons.length} temporada{series.seasons.length === 1 ? '' : 's'} ·{' '}
              {totalEpisodes} episodios
            </div>
          )}

          {existing ? (
            <Link
              to={isSeries ? `/series/${existing.id}` : `/movie/${existing.id}`}
              className="btn btn-primary btn-sm"
              style={{ marginTop: 10 }}
            >
              Ya está en tu biblioteca · Ver ficha
            </Link>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              style={{ marginTop: 10 }}
              onClick={add}
              disabled={adding}
            >
              {adding ? '…' : isSeries ? '📺 Añadir serie' : '🎬 Añadir película'}
            </button>
          )}
        </div>
      </div>

      {data.overview && (
        <p className="muted" style={{ fontSize: '0.9rem' }}>
          {data.overview}
        </p>
      )}

      {series && series.seasons.length > 0 && (
        <section className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ marginTop: 0 }}>Temporadas</h3>
          <div className="stack">
            {series.seasons.map((s) => (
              <div className="row spread" key={s.seasonNumber}>
                <span>{s.name || `Temporada ${s.seasonNumber}`}</span>
                <span className="muted">{s.episodeCount} episodios</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <WhereToWatch tmdbId={id} kind={isSeries ? 'tv' : 'movie'} />

      <SimilarTitles tmdbId={id} kind={isSeries ? 'tv' : 'movie'} />
    </div>
  )
}
