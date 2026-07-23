import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../lib/db'
import { addBook } from '../lib/library'
import { toast } from '../lib/toast'
import type { BookResult } from '../lib/openlibrary'

/**
 * Vista previa de un libro SIN añadirlo a la biblioteca. Open Library no
 * ofrece un endpoint de detalle tan rico como TMDB, así que reutilizamos los
 * datos que ya trajo la búsqueda (pasados por `location.state`) en vez de
 * volver a pedirlos: solo se llega aquí desde el propio buscador.
 */
export default function PreviewBook() {
  const { key: rawKey } = useParams<{ key: string }>()
  const key = rawKey ? decodeURIComponent(rawKey) : ''
  const navigate = useNavigate()
  const location = useLocation()
  const book = location.state as BookResult | undefined
  const [adding, setAdding] = useState(false)

  // 'source' no está indexado en Dexie: traemos todo y filtramos en JS.
  const existing = useLiveQuery(
    () =>
      db.items
        .toArray()
        .then((items) => items.find((i) => i.source === book?.source && i.sourceId === key)),
    [key, book?.source],
  )

  if (!book) {
    return (
      <div className="empty">
        <p>Vuelve a buscar este libro para ver su ficha.</p>
        <Link to="/search" className="btn btn-primary">
          Buscar
        </Link>
      </div>
    )
  }

  const add = async () => {
    setAdding(true)
    try {
      const id = await addBook(book)
      toast(`Añadido: ${book.title}`)
      navigate(`/book/${id}`)
    } catch {
      toast('No se pudo añadir')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div>
      <div className="detail-head">
        {book.cover ? (
          <img className="detail-poster" src={book.cover} alt={book.title} />
        ) : (
          <div className="detail-poster poster-fallback" style={{ position: 'static' }}>
            📖
          </div>
        )}
        <div>
          <h2 style={{ margin: '0 0 6px' }}>{book.title}</h2>
          <div className="muted">
            {book.author ?? 'Autor desconocido'}
            {book.year ? ` · ${book.year}` : ''}
          </div>
          {book.pages && (
            <div className="muted" style={{ marginTop: 6 }}>
              {book.pages} páginas
            </div>
          )}

          {existing ? (
            <Link
              to={`/book/${existing.id}`}
              className="btn btn-primary btn-sm"
              style={{ marginTop: 10 }}
            >
              Ya está en tu biblioteca · Ver ficha
            </Link>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              style={{ marginTop: 10 }}
              onClick={add}
              disabled={adding}
            >
              {adding ? '…' : '📖 Añadir libro'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
