// Modelo de datos de Ludok Time.
//
// El formato de las copias (`BackupFile`) viene heredado de la versión web, que
// es de donde se migraron los datos, y `SCHEMA_VERSION` sigue valiendo 2 por eso
// mismo. Se pueden AÑADIR campos opcionales sin problema — las copias antiguas
// siguen entrando —, pero cambiar o quitar los que ya existen dejaría fuera
// cualquier copia guardada antes, que es justo lo que no puede pasar aquí.

export type MediaType = 'series' | 'movie' | 'book' | 'manga' | 'custom'

// 'googlebooks' ya no se busca (se quitó esa fuente), pero se queda en la
// unión: libros ya añadidos desde ahí guardan ese valor en `source`, y
// quitarlo del tipo dejaría de tipar bien esos items existentes.
export type MediaSource = 'tmdb' | 'openlibrary' | 'googlebooks' | 'mangadex' | 'manual'

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
  /** autor del libro. */
  author?: string
  /** páginas totales del libro. */
  totalPages?: number
  /** por qué página vas (libros). */
  currentPage?: number
  /**
   * Manga: capítulos, no páginas. Se guarda aparte de `currentPage` a propósito
   * — un manga en curso no tiene un número de páginas que signifique nada, y
   * llamar «página» a un capítulo haría que el modelo mintiera.
   */
  currentChapter?: number
  totalChapters?: number
  /** Enlace directo al manga en inManga, para el botón de leer. */
  readUrl?: string
  status: Status
  /** valoración 0–10, 0 = sin valorar. */
  rating: number
  /**
   * Si al marcar un episodio suelto hay que ofrecer marcar también los
   * anteriores. `false` = el usuario eligió no volver a preguntar en esta serie.
   * Ausente = preguntar (el comportamiento por defecto).
   */
  askMarkPrevious?: boolean
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
  /**
   * Sin uso: era la key de Google Books, fuente que ya no se busca. Se queda
   * en el tipo por la misma regla que `MediaSource` — quitarla dejaría fuera
   * este campo de copias guardadas antes de quitar la fuente.
   */
  googleBooksApiKey?: string
  theme: 'dark' | 'light' | 'system'
  lastBackup: number
  /** Cuándo se pasó la bienvenida. Ausente = aún no se ha visto. */
  onboardedAt?: number

  /* --- Copia automática a un Nextcloud propio ------------------------------ */
  /** Base del servidor, p. ej. https://cloud.example.com */
  nextcloudUrl?: string
  nextcloudUser?: string
  /**
   * Contraseña de aplicación de Nextcloud.
   *
   * NO se incluye en las copias exportadas a propósito: una copia se comparte y
   * se mueve de sitio, y esta contraseña da permiso de ESCRITURA sobre tus
   * ficheros. Al restaurar en otro móvil hay que volver a escribirla.
   */
  nextcloudPassword?: string
  /** Carpeta destino dentro de tus ficheros. */
  nextcloudFolder?: string
  /** Si se sube sola al abrir la app estando en WiFi. */
  autoBackup?: boolean
  /** Última subida automática correcta. */
  lastAutoBackupAt?: number
  schemaVersion: number
}

/**
 * Un actor marcado como favorito.
 *
 * Va en su propia tabla y no como un `Item` más: un actor no es algo que estés
 * viendo ni leyendo, y meterlo en la biblioteca obligaría a excluirlo en cada
 * consulta, filtro y contador — que es exactamente el lío que dieron los vídeos
 * de YouTube antes de quitarlos.
 */
export interface Person {
  id: string
  /** Su id en TMDB, que es por donde se le pregunta todo lo demás. */
  tmdbId: number
  name: string
  /** URL de la foto, ya montada. */
  photo?: string
  addedAt: number
}

/** Estructura del fichero de copia de seguridad (export/import). */
export interface BackupFile {
  app: 'ludok-time'
  schemaVersion: number
  exportedAt: number
  items: Item[]
  episodes: Episode[]
  /**
   * Actores favoritos. Opcional: las copias anteriores a esta función no lo
   * traen, y el formato solo crece — nunca se quita ni se cambia lo que ya está.
   */
  people?: Person[]
  settings: Settings | null
}
