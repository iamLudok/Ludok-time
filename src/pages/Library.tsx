import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import ItemCard from '../components/ItemCard'
import type { Item, MediaType, Status } from '../types'

type TypeFilter = 'all' | MediaType

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'Todo' },
  { key: 'series', label: '📺 Series' },
  { key: 'movie', label: '🎬 Pelis' },
  { key: 'book', label: '📖 Libros' },
]

const STATUS_FILTERS: { key: Status | 'all'; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'watching', label: 'Viendo' },
  { key: 'plan', label: 'Pendiente' },
  { key: 'completed', label: 'Completado' },
  { key: 'on_hold', label: 'En pausa' },
  { key: 'dropped', label: 'Abandonado' },
]

export default function Library() {
  const [type, setType] = useState<TypeFilter>('all')
  const [status, setStatus] = useState<Status | 'all'>('all')

  const items = useLiveQuery(
    () => db.items.orderBy('addedAt').reverse().toArray(),
    [],
    [],
  )

  const matchesType = (i: Item) => type === 'all' || i.type === type
  // Los vídeos de YouTube viven en su propia sección: pueden ser miles y
  // ahogarían la biblioteca.
  const library = (items ?? []).filter((i) => i.type !== 'youtube')
  const filtered = library.filter(
    (i) => matchesType(i) && (status === 'all' || i.status === status),
  )

  return (
    <div>
      <h2 className="page-title">Mi biblioteca</h2>

      <div className="chip-row" style={{ marginBottom: 10 }}>
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.key}
            className={'chip' + (type === f.key ? ' active' : '')}
            onClick={() => setType(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="chip-row" style={{ marginBottom: 18 }}>
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            className={'chip' + (status === f.key ? ' active' : '')}
            onClick={() => setStatus(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="big">🍿</div>
          <p>
            {library.length === 0 ? 'Tu biblioteca está vacía.' : 'Nada con estos filtros.'}
          </p>
          <Link to="/search" className="btn btn-primary">
            Añadir algo
          </Link>
        </div>
      ) : (
        <div className="grid">
          {filtered.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
