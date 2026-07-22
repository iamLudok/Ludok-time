import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { isAnime } from '../lib/library'

function fmtHours(minutes: number): string {
  if (minutes <= 0) return '0 h'
  const h = Math.round(minutes / 60)
  if (h < 24) return `${h} h`
  const days = Math.floor(h / 24)
  return `${days} d ${h % 24} h`
}

export default function Stats() {
  const items = useLiveQuery(() => db.items.toArray(), [], [])
  const episodes = useLiveQuery(() => db.episodes.toArray(), [], [])

  if (!items || !episodes) return <div className="empty">Cargando…</div>

  // Los vídeos se cuentan aparte para no desvirtuar el resto de cifras.
  const videos = items.filter((i) => i.type === 'youtube')
  const library = items.filter((i) => i.type !== 'youtube')

  const series = library.filter((i) => i.type === 'series' && !isAnime(i)).length
  const anime = library.filter((i) => isAnime(i)).length
  const movies = library.filter((i) => i.type === 'movie')
  const moviesWatched = movies.filter((i) => i.status === 'completed')
  const books = library.filter((i) => i.type === 'book')
  const booksRead = books.filter((i) => i.status === 'completed')
  const pagesRead = books.reduce((sum, b) => sum + (b.currentPage ?? 0), 0)
  const watchedEps = episodes.filter((e) => e.watched)
  const completed = library.filter((i) => i.status === 'completed').length

  // Tiempo estimado: episodios vistos * duración (o 40 min por defecto) + pelis vistas.
  const itemMap = new Map(items.map((i) => [i.id, i]))
  let minutes = 0
  for (const e of watchedEps) {
    minutes += e.runtime || itemMap.get(e.itemId)?.runtime || 40
  }
  for (const m of moviesWatched) minutes += m.runtime || 110

  const stats = [
    { n: library.length, l: 'Títulos' },
    { n: series, l: 'Series' },
    { n: anime, l: 'Anime' },
    { n: movies.length, l: 'Películas' },
    { n: books.length, l: 'Libros' },
    { n: watchedEps.length, l: 'Episodios vistos' },
    { n: moviesWatched.length, l: 'Pelis vistas' },
    { n: booksRead.length, l: 'Libros leídos' },
    { n: pagesRead, l: 'Páginas leídas' },
    { n: completed, l: 'Completados' },
    { n: fmtHours(minutes), l: 'Tiempo estimado' },
    { n: videos.length, l: 'Vídeos guardados' },
  ]

  return (
    <div>
      <h2 className="page-title">Estadísticas</h2>
      <div className="stat-grid">
        {stats.map((s) => (
          <div className="stat" key={s.l}>
            <div className="n">{s.n}</div>
            <div className="l">{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
