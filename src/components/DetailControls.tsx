import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RatingInput from './RatingInput'
import { setStatus, setRating, updateItem, deleteItem, statusLabel } from '../lib/library'
import { toast } from '../lib/toast'
import type { Item, Status } from '../types'

const STATUSES: Status[] = ['plan', 'watching', 'completed', 'on_hold', 'dropped']

export default function DetailControls({ item }: { item: Item }) {
  const navigate = useNavigate()
  const [notes, setNotes] = useState(item.notes ?? '')
  const [tagText, setTagText] = useState(item.tags.join(', '))

  // Sincroniza los campos de texto si el item cambia por fuera.
  useEffect(() => {
    setNotes(item.notes ?? '')
    setTagText(item.tags.join(', '))
  }, [item.id])

  const saveNotes = () => {
    updateItem(item.id, { notes })
    const tags = tagText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    updateItem(item.id, { tags })
    toast('Guardado')
  }

  const remove = async () => {
    if (!confirm(`¿Borrar "${item.title}" y todo su progreso?`)) return
    await deleteItem(item.id)
    toast('Eliminado')
    navigate('/')
  }

  return (
    <div className="stack">
      <div className="field">
        <label className="label">Estado</label>
        <select value={item.status} onChange={(e) => setStatus(item.id, e.target.value as Status)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="label">Tu valoración</label>
        <RatingInput value={item.rating} onChange={(v) => setRating(item.id, v)} />
      </div>

      <div className="field">
        <label className="label">Etiquetas (separadas por comas)</label>
        <input
          value={tagText}
          onChange={(e) => setTagText(e.target.value)}
          placeholder="favorita, con amigos…"
        />
      </div>

      <div className="field">
        <label className="label">Notas</label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Lo que quieras recordar…"
        />
      </div>

      <div className="row spread">
        <button className="btn btn-primary" onClick={saveNotes}>
          Guardar notas
        </button>
        <button className="btn btn-danger" onClick={remove}>
          Eliminar
        </button>
      </div>
    </div>
  )
}
