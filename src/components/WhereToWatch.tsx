import { useEffect, useState } from 'react'
import { getWatchProviders, type WatchProviders } from '../lib/tmdb'
import { providerSearchUrl, baseProviderName } from '../lib/streamingLinks'

/**
 * Dónde ver una serie/película (Netflix, HBO, Prime…) para España. Consulta
 * TMDB en vivo cada vez (datos de JustWatch, cambian con el tiempo, no se
 * guardan). Si falla o no hay datos, no muestra nada: es información
 * secundaria, no debe romper la ficha.
 */
export default function WhereToWatch({
  tmdbId,
  kind,
  title,
}: {
  tmdbId: number
  kind: 'movie' | 'tv'
  title: string
}) {
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

  // TMDB lista variantes de la misma plataforma como proveedores distintos
  // (p. ej. "Netflix" y "Netflix Standard with Ads", o alquiler y compra
  // repitiendo la misma plataforma): quitamos duplicados por nombre base.
  const dedupe = (list: WatchProviders['providers']) => [
    ...new Map(list.map((p) => [baseProviderName(p.name), p])).values(),
  ]
  const flatrate = dedupe(data.providers.filter((p) => p.type === 'flatrate'))
  const otherUnique = dedupe(data.providers.filter((p) => p.type !== 'flatrate'))

  const Row = ({ label, list }: { label: string; list: typeof data.providers }) => (
    <div style={{ marginBottom: 8 }}>
      <div className="poster-sub" style={{ marginBottom: 4 }}>
        {label}
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {list.map((p) => {
          const searchUrl = providerSearchUrl(p.name, title)
          const img = (
            <img
              src={p.logoUrl}
              alt={p.name}
              title={searchUrl ? `Buscar en ${p.name}` : p.name}
              style={{ width: 36, height: 36, borderRadius: 8 }}
            />
          )
          return searchUrl ? (
            <a key={p.name} href={searchUrl} target="_blank" rel="noreferrer">
              {img}
            </a>
          ) : (
            <span key={p.name}>{img}</span>
          )
        })}
      </div>
    </div>
  )

  return (
    <section className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginTop: 0 }}>📍 Dónde verla</h3>
      {flatrate.length > 0 && <Row label="Con suscripción" list={flatrate} />}
      {otherUnique.length > 0 && <Row label="Alquiler / compra" list={otherUnique} />}
      <p className="muted" style={{ fontSize: '0.72rem', marginTop: 6, marginBottom: 0 }}>
        Disponibilidad en España · toca un logo para buscarlo ahí ·{' '}
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
