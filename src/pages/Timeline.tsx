import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import type { Activity, ActivityKind, Item } from '../types'

const KIND_ICON: Record<ActivityKind, string> = {
  watched_episode: '📺',
  unwatched_episode: '↩️',
  watched_movie: '🎬',
  rated: '⭐',
  status_change: '🔄',
  added: '➕',
}

function dayLabel(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const yest = new Date(Date.now() - 86_400_000)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Hoy'
  if (same(d, yest)) return 'Ayer'
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

function time(ts: number): string {
  return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function detailPath(item: Item): string {
  return item.type === 'series' ? `/series/${item.id}` : `/movie/${item.id}`
}

export default function Timeline() {
  const activity = useLiveQuery(
    () => db.activity.orderBy('at').reverse().limit(300).toArray(),
    [],
    [],
  )
  const items = useLiveQuery(() => db.items.toArray(), [], [])
  const itemMap = new Map((items ?? []).map((i) => [i.id, i]))

  if (activity && activity.length === 0) {
    return (
      <div>
        <h2 className="page-title">Diario</h2>
        <div className="empty">
          <div className="big">🕒</div>
          <p>Aquí aparecerá todo lo que vayas viendo.</p>
        </div>
      </div>
    )
  }

  // Agrupamos por día.
  const groups: { label: string; entries: Activity[] }[] = []
  for (const a of activity ?? []) {
    const label = dayLabel(a.at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.entries.push(a)
    else groups.push({ label, entries: [a] })
  }

  return (
    <div>
      <h2 className="page-title">Diario</h2>
      {groups.map((g) => (
        <div key={g.label} style={{ marginBottom: 18 }}>
          <div className="label" style={{ marginBottom: 8 }}>
            {g.label}
          </div>
          {g.entries.map((a) => {
            const item = itemMap.get(a.itemId)
            return (
              <div className="timeline-item" key={a.id}>
                <div className="timeline-ico">{KIND_ICON[a.kind]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>
                    {item ? (
                      <Link to={detailPath(item)} style={{ fontWeight: 600 }}>
                        {item.title}
                      </Link>
                    ) : (
                      <span style={{ fontWeight: 600 }} className="muted">
                        (eliminado)
                      </span>
                    )}
                  </div>
                  <div className="muted" style={{ fontSize: '0.85rem' }}>
                    {a.label}
                  </div>
                </div>
                <div className="muted" style={{ fontSize: '0.75rem' }}>
                  {time(a.at)}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
