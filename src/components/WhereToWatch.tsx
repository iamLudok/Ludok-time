import { useEffect, useState } from 'react'
import { getWatchProviders, type WatchProviders } from '../lib/tmdb'

/**
 * Dónde ver una serie/película (Netflix, HBO, Prime…) para España. Consulta
 * TMDB en vivo cada vez (datos de JustWatch, cambian con el tiempo, no se
 * guardan). Si falla o no hay datos, no muestra nada: es información
 * secundaria, no debe romper la ficha.
 */
export default function WhereToWatch({ tmdbId, kind }: { tmdbId: number; kind: 'movie' | 'tv' }) {
  const [data, setData] = useState<WatchProviders | null>(null)

  useEffect(() => {
    let alive = true
    getWatchProviders(tmdbId, kind)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null))
    return () => {
      alive = false
    }
  }, [tmdbId, kind])

  if (!data || data.providers.length === 0) return null

  const flatrate = data.providers.filter((p) => p.type === 'flatrate')
  const other = data.providers.filter((p) => p.type !== 'flatrate')
  // Alquiler y compra suelen repetir plataforma: quitamos duplicados por nombre.
  const otherUnique = [...new Map(other.map((p) => [p.name, p])).values()]

  const Row = ({ label, list }: { label: string; list: typeof data.providers }) => (
    <div style={{ marginBottom: 8 }}>
      <div className="poster-sub" style={{ marginBottom: 4 }}>
        {label}
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {list.map((p) => (
          <img
            key={p.name}
            src={p.logoUrl}
            alt={p.name}
            title={p.name}
            style={{ width: 36, height: 36, borderRadius: 8 }}
          />
        ))}
      </div>
    </div>
  )

  return (
    <section className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginTop: 0 }}>📍 Dónde verla</h3>
      {flatrate.length > 0 && <Row label="Con suscripción" list={flatrate} />}
      {otherUnique.length > 0 && <Row label="Alquiler / compra" list={otherUnique} />}
      <p className="muted" style={{ fontSize: '0.72rem', marginTop: 6, marginBottom: 0 }}>
        Disponibilidad en España ·{' '}
        {data.link ? (
          <a href={data.link} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
            datos de JustWatch
          </a>
        ) : (
          'datos de JustWatch'
        )}
      </p>
    </section>
  )
}
