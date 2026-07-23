import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { getSimilar, posterUrl, type TmdbSimilar } from '../lib/tmdb'
import { addMovieFromTmdb, addSeriesFromTmdb } from '../lib/library'
import { toast } from '../lib/toast'

/**
 * "También te puede gustar": títulos parecidos por género/temática (consulta
 * en vivo a TMDB, no se guarda). `originalLanguage` lo calcula el padre (que
 * ya tiene que pedir los datos del título base para otras cosas) y aquí solo
 * se usa para filtrar: 'similar' de TMDB mezcla géneros sin distinguir
 * origen, así que sin este filtro un anime japonés puede acabar
 * recomendando series occidentales con temática parecida. Se excluyen los
 * que ya tienes en tu biblioteca y se pueden añadir directamente desde aquí.
 */
export default function SimilarTitles({
  tmdbId,
  kind,
  originalLanguage,
}: {
  tmdbId: number
  kind: 'movie' | 'tv'
  originalLanguage?: string
}) {
  const [results, setResults] = useState<TmdbSimilar[] | null>(null)
  const [addingId, setAddingId] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    setResults(null)
    getSimilar(tmdbId, kind)
      .then((r) => alive && setResults(r))
      .catch(() => alive && setResults([]))
    return () => {
      alive = false
    }
  }, [tmdbId, kind])

  // 'source' no está indexado en Dexie: traemos todo y filtramos en JS.
  const existingIds = useLiveQuery(
    () =>
      db.items
        .toArray()
        .then((items) => new Set(items.filter((i) => i.source === 'tmdb').map((i) => i.sourceId))),
    [],
    new Set<string | undefined>(),
  )

  if (!results || results.length === 0) return null

  const byLanguage = originalLanguage
    ? results.filter((r) => r.originalLanguage === originalLanguage)
    : results
  const filtered = byLanguage.filter((r) => !existingIds.has(String(r.id))).slice(0, 12)
  if (filtered.length === 0) return null

  const add = async (r: TmdbSimilar) => {
    setAddingId(r.id)
    try {
      if (kind === 'movie') {
        await addMovieFromTmdb(r.id, 'movie', 'plan')
      } else {
        const { failedSeasons } = await addSeriesFromTmdb(r.id, 'plan')
        if (failedSeasons > 0) {
          toast(`⚠️ ${failedSeasons} temporada${failedSeasons === 1 ? '' : 's'} no se pudo cargar`)
        }
      }
      toast(`Añadido: ${r.title}`)
    } catch {
      toast('No se pudo añadir')
    } finally {
      setAddingId(null)
    }
  }

  return (
    <section className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginTop: 0 }}>🔎 También te puede gustar</h3>
      <div className="similar-row">
        {filtered.map((r) => (
          <div className="similar-card" key={r.id}>
            <Link to={`/preview/${kind}/${r.id}`} className="similar-poster">
              {r.posterPath ? (
                <img src={posterUrl(r.posterPath, 'w185')} alt={r.title} loading="lazy" />
              ) : (
                <div className="poster-fallback">{kind === 'movie' ? '🎬' : '📺'}</div>
              )}
              <button
                className="similar-add"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  add(r)
                }}
                disabled={addingId === r.id}
                title="Añadir a mi biblioteca"
              >
                {addingId === r.id ? '…' : '+'}
              </button>
            </Link>
            <Link to={`/preview/${kind}/${r.id}`} className="similar-title">
              {r.title}
            </Link>
          </div>
        ))}
      </div>
    </section>
  )
}
