import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useSettings } from '../lib/settings'
import type { Activity, ActivityKind, Item } from '../types'

const KIND_ICON: Record<ActivityKind, string> = {
  watched_episode: '📺',
  watched_movie: '🎬',
  book_finished: '📖',
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
  if (item.type === 'series') return `/series/${item.id}`
  if (item.type === 'book') return `/book/${item.id}`
  return `/movie/${item.id}`
}

export default function Timeline() {
  const settings = useSettings()
  const activity = useLiveQuery(
    () => db.activity.orderBy('at').reverse().limit(300).toArray(),
    [],
    [],
  )
  const items = useLiveQuery(() => db.items.toArray(), [], [])
  const itemMap = new Map((items ?? []).map((i) => [i.id, i]))

  // Filtro defensivo: si el navegador guardó actividad de una versión anterior
  // (cuando el diario registraba "añadido"/"valorado"/etc.), la ignoramos aquí
  // en vez de mostrarla o de tener que migrar la base de datos.
  const consumo = (activity ?? []).filter((a) => a.kind in KIND_ICON)

  const catchUpBanner = settings.catchUpMode && (
    <div className="banner" style={{ marginLeft: 0, marginRight: 0 }}>
      <span>
        📥 Modo puesta al día activo: lo que marques ahora no aparecerá aquí. Apágalo en Ajustes
        cuando termines de recuperar tu historial.
      </span>
    </div>
  )

  if (activity && consumo.length === 0) {
    return (
      <div>
        <h2 className="page-title">Diario</h2>
        {catchUpBanner}
        <div className="empty">
          <div className="big">🕒</div>
          <p>Aquí aparecerá lo que veas o leas a partir de ahora.</p>
        </div>
      </div>
    )
  }

  // Agrupamos por día.
  const groups: { label: string; entries: Activity[] }[] = []
  for (const a of consumo) {
    const label = dayLabel(a.at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.entries.push(a)
    else groups.push({ label, entries: [a] })
  }

  return (
    <div>
      <h2 className="page-title">Diario</h2>
      {catchUpBanner}
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
