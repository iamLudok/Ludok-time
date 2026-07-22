import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import type { Item } from '../types'

const DEFAULT_EPISODE_MIN = 40
const DEFAULT_MOVIE_MIN = 110

function fmtHours(minutes: number): string {
  if (minutes <= 0) return '0 h'
  const h = Math.round(minutes / 60)
  if (h < 24) return `${h} h`
  const days = Math.floor(h / 24)
  return `${days} d ${h % 24} h`
}

interface Stat {
  n: number | string
  l: string
}

function Section({
  icon,
  title,
  stats,
  note,
}: {
  icon: string
  title: string
  stats: Stat[]
  note?: string
}) {
  return (
    <section className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginTop: 0 }}>
        {icon} {title}
      </h3>
      <div className="stat-grid">
        {stats.map((s) => (
          <div className="stat" key={s.l}>
            <div className="n">{s.n}</div>
            <div className="l">{s.l}</div>
          </div>
        ))}
      </div>
      {note && (
        <p className="muted" style={{ fontSize: '0.78rem', marginTop: 10, marginBottom: 0 }}>
          {note}
        </p>
      )}
    </section>
  )
}

export default function Stats() {
  const items = useLiveQuery(() => db.items.toArray(), [], [])
  const episodes = useLiveQuery(() => db.episodes.toArray(), [], [])

  if (!items || !episodes) return <div className="empty">Cargando…</div>

  const seriesItems = items.filter((i) => i.type === 'series')
  const movies = items.filter((i) => i.type === 'movie')
  const books = items.filter((i) => i.type === 'book')
  const videos = items.filter((i) => i.type === 'youtube')

  // --- Series ---------------------------------------------------------------
  const watchedEps = episodes.filter((e) => e.watched)
  const seriesMap = new Map<string, Item>(seriesItems.map((i) => [i.id, i]))
  // Duración real de TMDB cuando la tenemos; si no, una media orientativa.
  let seriesMinutes = 0
  let seriesEstimated = 0
  for (const e of watchedEps) {
    const real = e.runtime || seriesMap.get(e.itemId)?.runtime
    seriesMinutes += real || DEFAULT_EPISODE_MIN
    if (!real) seriesEstimated++
  }
  const seriesCompleted = seriesItems.filter((i) => i.status === 'completed').length

  // --- Películas --------------------------------------------------------------
  const moviesWatched = movies.filter((i) => i.status === 'completed')
  let moviesMinutes = 0
  let moviesEstimated = 0
  for (const m of moviesWatched) {
    moviesMinutes += m.runtime || DEFAULT_MOVIE_MIN
    if (!m.runtime) moviesEstimated++
  }

  // --- Libros -----------------------------------------------------------------
  const booksRead = books.filter((i) => i.status === 'completed')
  const pagesRead = books.reduce((sum, b) => sum + (b.currentPage ?? 0), 0)

  return (
    <div>
      <h2 className="page-title">Estadísticas</h2>

      <Section
        icon="📺"
        title="Series"
        stats={[
          { n: seriesItems.length, l: 'En biblioteca' },
          { n: seriesCompleted, l: 'Completadas' },
          { n: watchedEps.length, l: 'Episodios vistos' },
          { n: fmtHours(seriesMinutes), l: 'Tiempo visto' },
        ]}
        note={
          watchedEps.length > 0
            ? seriesEstimated > 0
              ? `Duración real de TMDB donde está disponible; ${seriesEstimated} episodio${seriesEstimated === 1 ? '' : 's'} sin ese dato se estimó en ${DEFAULT_EPISODE_MIN} min.`
              : 'Duración real de cada episodio, según TMDB.'
            : undefined
        }
      />

      <Section
        icon="🎬"
        title="Películas"
        stats={[
          { n: movies.length, l: 'En biblioteca' },
          { n: moviesWatched.length, l: 'Vistas' },
          { n: fmtHours(moviesMinutes), l: 'Tiempo visto' },
        ]}
        note={
          moviesWatched.length > 0
            ? moviesEstimated > 0
              ? `Duración real de TMDB donde está disponible; ${moviesEstimated} sin ese dato se estimó en ${DEFAULT_MOVIE_MIN} min.`
              : 'Duración real de cada película, según TMDB.'
            : undefined
        }
      />

      <Section
        icon="📖"
        title="Libros"
        stats={[
          { n: books.length, l: 'En biblioteca' },
          { n: booksRead.length, l: 'Leídos' },
          { n: pagesRead, l: 'Páginas leídas' },
        ]}
      />

      <Section icon="▶️" title="Vídeos" stats={[{ n: videos.length, l: 'Guardados' }]} />
    </div>
  )
}
