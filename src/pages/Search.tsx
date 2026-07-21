import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { searchMulti, posterUrl, type TmdbSearchResult } from '../lib/tmdb'
import { addMovieFromTmdb, addSeriesFromTmdb } from '../lib/library'
import { useSettings } from '../lib/settings'
import { toast } from '../lib/toast'

export default function Search() {
  const settings = useSettings()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TmdbSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [addingId, setAddingId] = useState<number | null>(null)

  const doSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setError('')
    try {
      setResults(await searchMulti(query))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al buscar')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const add = async (r: TmdbSearchResult, kind: 'movie' | 'series') => {
    setAddingId(r.id)
    try {
      const id =
        kind === 'movie'
          ? await addMovieFromTmdb(r.id, 'movie', 'plan')
          : await addSeriesFromTmdb(r.id, 'plan')
      toast(`Añadido: ${r.title}`)
      navigate(kind === 'movie' ? `/movie/${id}` : `/series/${id}`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo añadir')
    } finally {
      setAddingId(null)
    }
  }

  if (!settings.tmdbApiKey) {
    return (
      <div>
        <h2 className="page-title">Añadir</h2>
        <div className="card">
          <p>Para buscar series y películas necesitas una API key gratuita de TMDB.</p>
          <Link to="/settings" className="btn btn-primary">
            Configurar en Ajustes
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="page-title">Añadir</h2>
      <form onSubmit={doSearch} className="row" style={{ marginBottom: 16 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar serie o película…"
          autoFocus
        />
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? <span className="spin" /> : 'Buscar'}
        </button>
      </form>

      {error && <div className="banner danger">{error}</div>}

      <div className="stack">
        {results.map((r) => (
          <div className="search-result" key={`${r.mediaType}-${r.id}`}>
            {r.posterPath ? (
              <img src={posterUrl(r.posterPath, 'w185')} alt={r.title} loading="lazy" />
            ) : (
              <div className="thumb">{r.mediaType === 'tv' ? '📺' : '🎬'}</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>
                {r.title} {r.year ? <span className="muted">({r.year})</span> : null}
              </div>
              <p className="muted" style={{ fontSize: '0.82rem', margin: '4px 0 8px' }}>
                {r.overview ? r.overview.slice(0, 120) + (r.overview.length > 120 ? '…' : '') : ''}
              </p>
              <div className="chip-row">
                {r.mediaType === 'movie' ? (
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={addingId === r.id}
                    onClick={() => add(r, 'movie')}
                  >
                    {addingId === r.id ? '…' : '🎬 Añadir película'}
                  </button>
                ) : (
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={addingId === r.id}
                    onClick={() => add(r, 'series')}
                  >
                    {addingId === r.id ? '…' : '📺 Añadir serie'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
