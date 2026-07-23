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
 * Muestra "Visto: 22 jul 2026" y permite corregir la fecha a mano, o quitarla
 * del todo si no sabes cuándo fue (botón "Quitar"). Sirve para volcar
 * historial antiguo sin que quede "hoy" cuando en realidad lo viste hace
 * tiempo, o sin fecha si ni siquiera te acuerdas.
 */
export default function WatchedDate({
  timestamp,
  onChange,
  label = 'Visto',
}: {
  timestamp?: number
  onChange: (ts: number | undefined) => void
  label?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(timestamp ? toDateInput(timestamp) : '')

  const startEditing = () => {
    setDraft(timestamp ? toDateInput(timestamp) : '')
    setEditing(true)
  }

  const save = () => {
    onChange(draft ? new Date(draft + 'T12:00').getTime() : undefined)
    setEditing(false)
  }

  const clear = () => {
    onChange(undefined)
    setEditing(false)
  }

  if (editing) {
    return (
      <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <input
          type="date"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ width: 'auto', padding: '2px 6px', fontSize: '0.75rem' }}
        />
        <button className="btn btn-sm" onClick={save}>
          OK
        </button>
        {timestamp && (
          <button className="btn btn-sm" onClick={clear}>
            Quitar
          </button>
        )}
      </span>
    )
  }

  return (
    <button
      className="poster-sub"
      onClick={startEditing}
      style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
      title="Cambiar o quitar esta fecha"
    >
      {timestamp ? `${label}: ${fmtDate(timestamp)}` : `${label} sin fecha`} ✏️
    </button>
  )
}
