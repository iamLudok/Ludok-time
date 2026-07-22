import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { setEpisodeWatched, epLabel } from '../lib/library'
import { toast } from '../lib/toast'
import type { Episode, Item } from '../types'

/**
 * Bloque "Continuar viendo" para la Biblioteca: series en estado "Viendo" con
 * su próximo episodio, marcable ahí mismo sin entrar en la ficha.
 */
export default function ContinueWatching({ items }: { items: Item[] }) {
  const ids = items.map((i) => i.id)
  const key = ids.join(',')
  const episodes = useLiveQuery(
    () =>
      ids.length ? db.episodes.where('itemId').anyOf(ids).toArray() : Promise.resolve([] as Episode[]),
    [key],
    [] as Episode[],
  )

  const rows = items
    .map((item) => {
      const eps = episodes
        .filter((e) => e.itemId === item.id)
        .sort((a, b) => a.season - b.season || a.episode - b.episode)
      const next = eps.find((e) => !e.watched)
      return next ? { item, next } : null
    })
    .filter((r): r is { item: Item; next: Episode } => r !== null)

  if (rows.length === 0) return null

  const markWatched = async (episodeId: string, label: string) => {
    await setEpisodeWatched(episodeId, true)
    toast(`Visto: ${label}`)
  }

  return (
    <section style={{ marginBottom: 22 }}>
      <h3 style={{ margin: '0 0 10px' }}>▶ Continuar viendo</h3>
      <div className="stack">
        {rows.map(({ item, next }) => (
          <div className="search-result" key={item.id}>
            {item.poster ? (
              <img src={item.poster} alt={item.title} loading="lazy" />
            ) : (
              <div className="thumb">📺</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link to={`/series/${item.id}`} style={{ fontWeight: 600 }}>
                {item.title}
              </Link>
              <div className="muted" style={{ fontSize: '0.85rem', margin: '2px 0 8px' }}>
                Próximo: {epLabel(next)}
              </div>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => markWatched(next.id, epLabel(next))}
              >
                ✓ Marcar visto
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
