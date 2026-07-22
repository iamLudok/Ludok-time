import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { searchMulti, posterUrl, type TmdbSearchResult } from '../lib/tmdb'
import { searchBooks, type BookResult } from '../lib/openlibrary'
import { videoIdFromUrl, thumbnailUrl, fetchVideoInfo } from '../lib/youtube'
import { addMovieFromTmdb, addSeriesFromTmdb, addBook, addVideo, addManualVideo } from '../lib/library'
import { useSettings } from '../lib/settings'
import { toast } from '../lib/toast'

type Tab = 'screen' | 'books' | 'video'

const TABS: { key: Tab; label: string }[] = [
  { key: 'screen', label: '🎬 Series y pelis' },
  { key: 'books', label: '📖 Libros' },
  { key: 'video', label: '▶️ YouTube' },
]

export default function Search() {
  const [tab, setTab] = useState<Tab>('screen')

  return (
    <div>
      <h2 className="page-title">Añadir</h2>
      <div className="chip-row" style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={'chip' + (tab === t.key ? ' active' : '')}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'screen' && <ScreenSearch />}
      {tab === 'books' && <BookSearch />}
      {tab === 'video' && <VideoAdd />}
    </div>
  )
}

/* --- Series y películas (TMDB) -------------------------------------------- */

function ScreenSearch() {
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
      <div className="card">
        <p>Para buscar series y películas necesitas una API key gratuita de TMDB.</p>
        <Link to="/settings" className="btn btn-primary">
          Configurar en Ajustes
        </Link>
      </div>
    )
  }

  return (
    <div>
      <form onSubmit={doSearch} className="row" style={{ marginBottom: 16 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar serie o película…"
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
              <button
                className="btn btn-sm btn-primary"
                disabled={addingId === r.id}
                onClick={() => add(r, r.mediaType === 'movie' ? 'movie' : 'series')}
              >
                {addingId === r.id ? '…' : r.mediaType === 'movie' ? '🎬 Añadir película' : '📺 Añadir serie'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* --- Libros (Open Library) ------------------------------------------------- */

function BookSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BookResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [addingKey, setAddingKey] = useState<string | null>(null)

  const doSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setError('')
    try {
      setResults(await searchBooks(query))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al buscar')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const add = async (b: BookResult) => {
    setAddingKey(b.key)
    try {
      const id = await addBook(b)
      toast(`Añadido: ${b.title}`)
      navigate(`/book/${id}`)
    } catch {
      toast('No se pudo añadir')
    } finally {
      setAddingKey(null)
    }
  }

  return (
    <div>
      <form onSubmit={doSearch} className="row" style={{ marginBottom: 16 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar libro por título o autor…"
        />
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? <span className="spin" /> : 'Buscar'}
        </button>
      </form>

      <p className="muted" style={{ fontSize: '0.8rem', marginTop: -8 }}>
        Datos de Open Library · no necesita API key
      </p>

      {error && <div className="banner danger">{error}</div>}

      <div className="stack">
        {results.map((b) => (
          <div className="search-result" key={b.key}>
            {b.cover ? (
              <img src={b.cover} alt={b.title} loading="lazy" />
            ) : (
              <div className="thumb">📖</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>
                {b.title} {b.year ? <span className="muted">({b.year})</span> : null}
              </div>
              <p className="muted" style={{ fontSize: '0.82rem', margin: '4px 0 8px' }}>
                {b.author ?? 'Autor desconocido'}
                {b.pages ? ` · ${b.pages} págs.` : ''}
              </p>
              <button
                className="btn btn-sm btn-primary"
                disabled={addingKey === b.key}
                onClick={() => add(b)}
              >
                {addingKey === b.key ? '…' : '📖 Añadir libro'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* --- Vídeos de YouTube ----------------------------------------------------- */

function VideoAdd() {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [manual, setManual] = useState('')
  const [busy, setBusy] = useState(false)

  const videoId = videoIdFromUrl(url)

  const addFromUrl = async () => {
    if (!videoId) return
    setBusy(true)
    try {
      const info = await fetchVideoInfo(videoId)
      const title = info?.title ?? `Vídeo ${videoId}`
      await addVideo({ videoId, title, channel: info?.channel })
      toast(info ? `Añadido: ${title}` : 'Añadido (sin título: vídeo privado o borrado)')
      setUrl('')
      navigate('/videos')
    } catch {
      toast('No se pudo añadir el vídeo')
    } finally {
      setBusy(false)
    }
  }

  const addManual = async () => {
    if (!manual.trim()) return
    setBusy(true)
    try {
      await addManualVideo(manual.trim())
      toast('Añadido')
      setManual('')
      navigate('/videos')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <h3 style={{ marginTop: 0 }}>Pegar enlace</h3>
        <div className="field">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
          />
        </div>
        {videoId && (
          <div className="row" style={{ marginBottom: 12 }}>
            <img
              src={thumbnailUrl(videoId)}
              alt=""
              style={{ width: 120, borderRadius: 8 }}
            />
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              Vídeo detectado. El título se busca solo al añadirlo.
            </span>
          </div>
        )}
        {url && !videoId && <p className="muted">No reconozco ese enlace de YouTube.</p>}
        <button className="btn btn-primary" disabled={!videoId || busy} onClick={addFromUrl}>
          {busy ? '…' : '▶️ Añadir vídeo'}
        </button>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>Apuntar a mano</h3>
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Sin enlace ni miniatura, solo el título.
        </p>
        <div className="field">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Título del vídeo"
          />
        </div>
        <button className="btn" disabled={!manual.trim() || busy} onClick={addManual}>
          Apuntar
        </button>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>Importar historial</h3>
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          ¿Tienes tu historial de Google Takeout? Impórtalo entero desde la sección de vídeos.
        </p>
        <Link to="/videos" className="btn">
          Ir a Vídeos
        </Link>
      </section>
    </div>
  )
}
