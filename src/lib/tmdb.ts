// Cliente ligero de la API de TMDB (v3). La API key la pone el usuario en Ajustes.
// TMDB permite peticiones desde el navegador (CORS abierto).

import { getSettings } from './settings'

const BASE = 'https://api.themoviedb.org/3'
const IMG = 'https://image.tmdb.org/t/p'

export function posterUrl(
  path?: string | null,
  size: 'w92' | 'w185' | 'w342' | 'w500' = 'w342',
): string {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return `${IMG}/${size}${path}`
}

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const { tmdbApiKey } = await getSettings()
  if (!tmdbApiKey) {
    throw new Error('Falta la API key de TMDB. Añádela en Ajustes.')
  }
  const url = new URL(BASE + path)
  url.searchParams.set('api_key', tmdbApiKey)
  url.searchParams.set('language', 'es-ES')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString())
  if (res.status === 401) {
    throw new Error('API key de TMDB no válida. Revísala en Ajustes.')
  }
  if (!res.ok) {
    throw new Error(`Error de TMDB (${res.status}).`)
  }
  return res.json() as Promise<T>
}

export interface TmdbSearchResult {
  id: number
  mediaType: 'movie' | 'tv'
  title: string
  posterPath?: string
  overview?: string
  year?: number
}

interface RawMulti {
  results: Array<{
    id: number
    media_type: string
    title?: string
    name?: string
    poster_path?: string | null
    overview?: string
    release_date?: string
    first_air_date?: string
  }>
}

function yearFrom(date?: string): number | undefined {
  if (!date) return undefined
  const y = parseInt(date.slice(0, 4), 10)
  return Number.isFinite(y) ? y : undefined
}

/** Búsqueda multi (películas + series). Ignora personas. */
export async function searchMulti(query: string): Promise<TmdbSearchResult[]> {
  if (!query.trim()) return []
  const data = await tmdbFetch<RawMulti>('/search/multi', { query, include_adult: 'false' })
  return data.results
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) => ({
      id: r.id,
      mediaType: r.media_type as 'movie' | 'tv',
      title: r.title || r.name || '(sin título)',
      posterPath: r.poster_path ?? undefined,
      overview: r.overview,
      year: yearFrom(r.release_date || r.first_air_date),
    }))
}

export interface TmdbMovie {
  id: number
  title: string
  posterPath?: string
  overview?: string
  year?: number
  runtime?: number
}

export async function getMovie(id: number): Promise<TmdbMovie> {
  const raw = await tmdbFetch<{
    id: number
    title: string
    poster_path?: string | null
    overview?: string
    release_date?: string
    runtime?: number
  }>(`/movie/${id}`)
  return {
    id: raw.id,
    title: raw.title,
    posterPath: raw.poster_path ?? undefined,
    overview: raw.overview,
    year: yearFrom(raw.release_date),
    runtime: raw.runtime,
  }
}

export interface TmdbSeason {
  seasonNumber: number
  episodeCount: number
  name: string
}

export interface TmdbNextEpisode {
  season: number
  episode: number
  title?: string
  airDate?: string
}

export interface TmdbSeries {
  id: number
  title: string
  posterPath?: string
  overview?: string
  year?: number
  episodeRuntime?: number
  seasons: TmdbSeason[]
  /** Próximo episodio a emitir, si la serie sigue en emisión y TMDB lo sabe. */
  nextEpisode?: TmdbNextEpisode
  /**
   * Si la serie sigue en producción. OJO: usar esto y no `status` para saber
   * si "ya terminó" — pedimos los datos en es-ES y TMDB traduce `status`
   * ("Ended" → "Finalizada"), así que compararlo con los textos en inglés
   * nunca coincide de forma fiable. `in_production` es un booleano y no se
   * traduce.
   */
  inProduction?: boolean
}

export async function getSeries(id: number): Promise<TmdbSeries> {
  const raw = await tmdbFetch<{
    id: number
    name: string
    poster_path?: string | null
    overview?: string
    first_air_date?: string
    episode_run_time?: number[]
    in_production?: boolean
    seasons?: Array<{ season_number: number; episode_count: number; name: string }>
    next_episode_to_air?: {
      season_number: number
      episode_number: number
      name?: string
      air_date?: string
    } | null
  }>(`/tv/${id}`)
  return {
    id: raw.id,
    title: raw.name,
    posterPath: raw.poster_path ?? undefined,
    overview: raw.overview,
    year: yearFrom(raw.first_air_date),
    episodeRuntime: raw.episode_run_time?.[0],
    inProduction: raw.in_production,
    seasons: (raw.seasons ?? [])
      .filter((s) => s.season_number > 0) // ignoramos "Especiales" (temporada 0)
      .map((s) => ({
        seasonNumber: s.season_number,
        episodeCount: s.episode_count,
        name: s.name,
      })),
    nextEpisode: raw.next_episode_to_air
      ? {
          season: raw.next_episode_to_air.season_number,
          episode: raw.next_episode_to_air.episode_number,
          title: raw.next_episode_to_air.name,
          airDate: raw.next_episode_to_air.air_date,
        }
      : undefined,
  }
}

export interface TmdbEpisode {
  season: number
  episode: number
  title?: string
  airDate?: string
  runtime?: number
}

export async function getSeasonEpisodes(seriesId: number, season: number): Promise<TmdbEpisode[]> {
  const raw = await tmdbFetch<{
    episodes?: Array<{
      season_number: number
      episode_number: number
      name?: string
      air_date?: string
      runtime?: number
    }>
  }>(`/tv/${seriesId}/season/${season}`)
  return (raw.episodes ?? []).map((e) => ({
    season: e.season_number,
    episode: e.episode_number,
    title: e.name,
    airDate: e.air_date,
    runtime: e.runtime,
  }))
}

export interface WatchProvider {
  name: string
  logoUrl: string
  /** 'flatrate' = suscripción, 'rent' = alquiler, 'buy' = compra. */
  type: 'flatrate' | 'rent' | 'buy'
}

export interface WatchProviders {
  /** Enlace de TMDB con el listado completo para este país. */
  link?: string
  providers: WatchProvider[]
}

interface RawProvider {
  provider_name: string
  logo_path: string
}

/**
 * Dónde ver una serie/película: datos de JustWatch servidos por TMDB, por país.
 * Es una consulta en vivo (no se guarda nada): la disponibilidad cambia con
 * el tiempo y no queremos mostrar datos caducados.
 */
export async function getWatchProviders(
  id: number,
  kind: 'movie' | 'tv',
  region = 'ES',
): Promise<WatchProviders> {
  const raw = await tmdbFetch<{
    results?: Record<
      string,
      { link?: string; flatrate?: RawProvider[]; rent?: RawProvider[]; buy?: RawProvider[] }
    >
  }>(`/${kind}/${id}/watch/providers`)
  const forRegion = raw.results?.[region]
  if (!forRegion) return { providers: [] }

  const mapList = (list: RawProvider[] | undefined, type: WatchProvider['type']): WatchProvider[] =>
    (list ?? []).map((p) => ({
      name: p.provider_name,
      logoUrl: posterUrl(p.logo_path, 'w92'),
      type,
    }))

  return {
    link: forRegion.link,
    providers: [
      ...mapList(forRegion.flatrate, 'flatrate'),
      ...mapList(forRegion.rent, 'rent'),
      ...mapList(forRegion.buy, 'buy'),
    ],
  }
}

export interface TmdbSimilar {
  id: number
  title: string
  posterPath?: string
  year?: number
}

/** Títulos parecidos por género/temática (no por comportamiento de usuarios). */
export async function getSimilar(id: number, kind: 'movie' | 'tv'): Promise<TmdbSimilar[]> {
  const data = await tmdbFetch<{
    results?: Array<{
      id: number
      title?: string
      name?: string
      poster_path?: string | null
      release_date?: string
      first_air_date?: string
    }>
  }>(`/${kind}/${id}/similar`)
  return (data.results ?? []).map((r) => ({
    id: r.id,
    title: r.title || r.name || '(sin título)',
    posterPath: r.poster_path ?? undefined,
    year: yearFrom(r.release_date || r.first_air_date),
  }))
}
