import { getSeries, getPersonFull, type TmdbNextEpisode, type TmdbPersonCredit } from './tmdb'
import { hasEpisode, syncSeriesEpisodes } from './library'
import type { Item, Person } from '../types'

/**
 * Próximos episodios de las series que sigues.
 *
 * Es una consulta EN VIVO a TMDB, nada se guarda: las fechas de emisión cambian
 * y una fecha caducada guardada sería peor que no tenerla.
 */

export interface Upcoming {
  item: Item
  next: TmdbNextEpisode
  /** Días hasta el estreno. Negativo si ya pasó. `null` si no hay fecha anunciada. */
  days: number | null
}

/**
 * Series que cuentan para esta pantalla.
 *
 * Incluye las **completadas** a propósito: desde que no se guardan episodios sin
 * emitir, estar al día con una serie en emisión la deja como «completada», y ese
 * es justo el caso en el que quieres saber cuándo sale el siguiente. Se dejan
 * fuera las pendientes (ni las has empezado), las abandonadas y las pausadas.
 */
export function followedSeries(items: Item[]): Item[] {
  return items.filter(
    (i) =>
      i.type === 'series' &&
      i.source === 'tmdb' &&
      !!i.sourceId &&
      (i.status === 'watching' || i.status === 'rewatching' || i.status === 'completed'),
  )
}

/** Días desde hoy hasta una fecha 'YYYY-MM-DD'. */
function daysUntil(airDate: string): number {
  const target = new Date(airDate + 'T00:00').getTime()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target - today.getTime()) / 86_400_000)
}

/**
 * Caché en memoria de la última consulta.
 *
 * La pantalla se abre muchas veces al día y las fechas de estreno no cambian de
 * un minuto para otro: sin esto, cada visita disparaba una petición por serie.
 * Se pierde al cerrar la app, que es justo lo que se quiere — no interesa
 * guardar fechas que pueden caducar.
 */
const CACHE_MS = 30 * 60 * 1000
let cache: { key: string; at: number; rows: Upcoming[] } | null = null

/** Fuerza que la próxima consulta vaya a la red (para el «deslizar para actualizar»). */
export function invalidateUpcoming(): void {
  cache = null
}

/** Devuelve lo cacheado si sigue valiendo para estas mismas series. */
export function cachedUpcoming(series: Item[]): Upcoming[] | null {
  if (!cache) return null
  if (cache.key !== series.map((s) => s.id).join(',')) return null
  if (Date.now() - cache.at > CACHE_MS) return null
  return cache.rows
}

/**
 * Pregunta a TMDB por cada serie, como mucho 4 a la vez para no chocar con su
 * límite. Las que fallen se ignoran: es información secundaria y no debe dejar
 * la pantalla en blanco por una petición perdida.
 */
export async function fetchUpcoming(series: Item[]): Promise<Upcoming[]> {
  const results: Upcoming[] = []
  let index = 0

  const worker = async () => {
    while (index < series.length) {
      const item = series[index++]
      try {
        const s = await getSeries(Number(item.sourceId))
        // Serie terminada o cancelada: no hay siguiente que esperar.
        if (s.inProduction === false) continue
        if (!s.nextEpisode) continue
        // El anterior ya salió pero no está en tu lista (el siguiente aún no sale,
        // así que no había ninguna pista): se trae solo, sin pedirte nada.
        const last = s.lastEpisode
        if (last && !(await hasEpisode(item.id, last.season, last.episode))) {
          await syncSeriesEpisodes(item.id).catch(() => {})
        }
        results.push({
          item,
          next: s.nextEpisode,
          days: s.nextEpisode.airDate ? daysUntil(s.nextEpisode.airDate) : null,
        })
      } catch {
        // Ignorada a propósito.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, series.length) }, worker))

  // Lo que sale antes, primero. Lo que no tiene fecha, al final: no se puede
  // ordenar y tampoco es lo que vienes a mirar.
  const rows = results.sort((a, b) => {
    if (a.days === null) return 1
    if (b.days === null) return -1
    return a.days - b.days
  })
  cache = { key: series.map((s) => s.id).join(','), at: Date.now(), rows }
  return rows
}

/** Texto de cuándo sale, en cristiano. */
export function whenLabel(days: number | null): string {
  if (days === null) return 'Sin fecha anunciada'
  if (days > 1) return `En ${days} días`
  if (days === 1) return 'Mañana'
  if (days === 0) return 'Hoy'
  return 'Ya debería estar'
}

/* --- Estrenos de tus actores favoritos ------------------------------------- */

/** Un estreno pendiente de alguien que sigues. */
export interface UpcomingRelease {
  credit: TmdbPersonCredit
  /** Quiénes de tus favoritos salen en él. */
  names: string[]
  /** Días hasta el estreno. `null` si está anunciado pero sin fecha. */
  days: number | null
}

const releaseCache = { key: '', at: 0, rows: [] as UpcomingRelease[] }

export function invalidateReleases(): void {
  releaseCache.key = ''
}

export function cachedReleases(people: Person[]): UpcomingRelease[] | null {
  const key = people.map((p) => p.tmdbId).join(',')
  if (!releaseCache.key || releaseCache.key !== key) return null
  if (Date.now() - releaseCache.at > CACHE_MS) return null
  return releaseCache.rows
}

/**
 * Lo que van a estrenar tus actores favoritos.
 *
 * Un mismo título puede salir por varios actores a la vez, así que se agrupa por
 * título y se juntan los nombres: ver dos veces la misma película porque siguen
 * a dos de su reparto sería ruido.
 */
export async function fetchUpcomingReleases(people: Person[]): Promise<UpcomingRelease[]> {
  const hoy = new Date().toISOString().slice(0, 10)
  const byTitle = new Map<number, UpcomingRelease>()
  let index = 0

  const worker = async () => {
    while (index < people.length) {
      const person = people[index++]
      try {
        const { credits } = await getPersonFull(person.tmdbId)
        for (const credit of credits) {
          // Solo lo que no ha salido todavía. Lo que no tiene fecha se queda:
          // está anunciado y es justo lo que interesa saber que viene.
          if (credit.date && credit.date <= hoy) continue

          const already = byTitle.get(credit.id)
          if (already) {
            if (!already.names.includes(person.name)) already.names.push(person.name)
            continue
          }
          byTitle.set(credit.id, {
            credit,
            names: [person.name],
            days: credit.date ? daysUntil(credit.date) : null,
          })
        }
      } catch {
        // Ignorada a propósito: una petición perdida no debe vaciar la pantalla.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, people.length) }, worker))

  const rows = [...byTitle.values()].sort((a, b) => {
    if (a.days === null) return 1
    if (b.days === null) return -1
    return a.days - b.days
  })
  releaseCache.key = people.map((p) => p.tmdbId).join(',')
  releaseCache.at = Date.now()
  releaseCache.rows = rows
  return rows
}
