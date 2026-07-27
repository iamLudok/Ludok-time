// Modelo de datos de Ludok Time.
//
// IMPORTANTE: este fichero es una copia deliberadamente idéntica al de la
// versión web. El formato de las copias de seguridad (`BackupFile`) tiene que
// seguir siendo el mismo en las dos, porque el JSON que exporta la PWA es la
// herramienta con la que se migran los datos a esta app. No cambiar la forma
// de estos tipos sin cambiarla también allí.

export type MediaType = 'series' | 'movie' | 'book' | 'youtube' | 'custom'

export type MediaSource = 'tmdb' | 'openlibrary' | 'googlebooks' | 'youtube' | 'manual'

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
  /** URL del fotograma del episodio (still de TMDB), si lo hay. */
  still?: string
  watched: boolean
  watchedAt?: number
}

export interface Settings {
  id: 'app'
  tmdbApiKey: string
  /** Opcional: sin ella Google Books comparte una cuota diaria anónima que se agota fácil. */
  googleBooksApiKey?: string
  theme: 'dark' | 'light' | 'system'
  lastBackup: number
  schemaVersion: number
}

/** Estructura del fichero de copia de seguridad (export/import). */
export interface BackupFile {
  app: 'ludok-time'
  schemaVersion: number
  exportedAt: number
  items: Item[]
  episodes: Episode[]
  settings: Settings | null
}
