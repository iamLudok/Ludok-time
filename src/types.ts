// Modelo de datos de Ludok Time.
// Todo vive en local (IndexedDB). Pensado para crecer a más tipos de contenido.

export type MediaType = 'series' | 'movie' | 'book' | 'youtube' | 'custom'

export type MediaSource = 'tmdb' | 'openlibrary' | 'youtube' | 'manual'

export type Status = 'plan' | 'watching' | 'completed' | 'on_hold' | 'dropped'

export interface Item {
  id: string
  type: MediaType
  source: MediaSource
  /** id en la fuente externa (p.ej. id de TMDB). Vacío si es manual. */
  sourceId?: string
  title: string
  /** ruta/URL de la carátula. */
  poster?: string
  overview?: string
  year?: number
  /** duración en minutos (películas) o duración media de episodio (series). */
  runtime?: number
  /** autor del libro o canal del vídeo de YouTube. */
  author?: string
  /** enlace original (vídeos de YouTube). */
  url?: string
  /** páginas totales del libro. */
  totalPages?: number
  /** por qué página vas (libros). */
  currentPage?: number
  status: Status
  /** valoración 0–10, 0 = sin valorar. */
  rating: number
  tags: string[]
  notes?: string
  addedAt: number
  startedAt?: number
  completedAt?: number
}

export interface Episode {
  id: string
  itemId: string
  season: number
  episode: number
  title?: string
  airDate?: string
  runtime?: number
  watched: boolean
  watchedAt?: number
}

// El diario es un registro de CONSUMO ("qué he visto/leído y cuándo"), no un
// log de toda acción sobre un título. Por eso solo hay estos tres tipos:
// nada de "añadido", "valorado" ni "cambio de estado".
export type ActivityKind = 'watched_episode' | 'watched_movie' | 'book_finished'

export interface Activity {
  id: string
  itemId: string
  episodeId?: string
  kind: ActivityKind
  /** texto legible para el diario, p.ej. "S1E3 · The Pilot". */
  label: string
  at: number
}

export interface Settings {
  id: 'app'
  tmdbApiKey: string
  theme: 'dark' | 'light' | 'system'
  lastBackup: number
  schemaVersion: number
  /**
   * Modo "puesta al día": al marcar episodios/pelis/libros como vistos NO se
   * escribe en el diario. Pensado para volcar de golpe historial antiguo
   * (p. ej. recuperado de TV Time) sin que parezca que lo viste todo hoy.
   */
  catchUpMode: boolean
}

/** Estructura del fichero de copia de seguridad (export/import). */
export interface BackupFile {
  app: 'ludok-time'
  schemaVersion: number
  exportedAt: number
  items: Item[]
  episodes: Episode[]
  activity: Activity[]
  settings: Settings | null
}
