import { useState } from 'react'

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** 'YYYY-MM-DD' en hora local, para el value de <input type="date">. */
function toDateInput(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Muestra "Visto: 22 jul 2026" y permite corregir la fecha a mano (clic → date
 * picker). Sirve para volcar historial antiguo sin que quede "hoy" cuando en
 * realidad lo viste hace tiempo.
 */
export default function WatchedDate({
  timestamp,
  onChange,
  label = 'Visto',
}: {
  timestamp: number
  onChange: (ts: number) => void
  label?: string
}) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={toDateInput(timestamp)}
        onBlur={(e) => {
          if (e.target.value) onChange(new Date(e.target.value + 'T12:00').getTime())
          setEditing(false)
        }}
        style={{ width: 'auto', padding: '2px 6px', fontSize: '0.75rem' }}
      />
    )
  }

  return (
    <button
      className="poster-sub"
      onClick={() => setEditing(true)}
      style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
      title={`Cambiar la fecha en que lo ${label === 'Leído' ? 'terminaste' : 'viste'}`}
    >
      {label}: {fmtDate(timestamp)} ✏️
    </button>
  )
}
