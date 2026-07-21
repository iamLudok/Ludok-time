// Cliente ligero de la API de TMDB (v3). La API key la pone el usuario en Ajustes.
// TMDB permite peticiones desde el navegador (CORS abierto).

import { getSettings } from './settings'

const BASE = 'https://api.themoviedb.org/3'
const IMG = 'https://image.tmdb.org/t/p'

export function posterUrl(path?: string | null, size: 'w185' | 'w342' | 'w500' = 'w342'): string {
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

export interface TmdbSeries {
  id: number
  title: string
  posterPath?: string
  overview?: string
  year?: number
  episodeRuntime?: number
  seasons: TmdbSeason[]
}

export async function getSeries(id: number): Promise<TmdbSeries> {
  const raw = await tmdbFetch<{
    id: number
    name: string
    poster_path?: string | null
    overview?: string
    first_air_date?: string
    episode_run_time?: number[]
    seasons?: Array<{ season_number: number; episode_count: number; name: string }>
  }>(`/tv/${id}`)
  return {
    id: raw.id,
    title: raw.name,
    posterPath: raw.poster_path ?? undefined,
    overview: raw.overview,
    year: yearFrom(raw.first_air_date),
    episodeRuntime: raw.episode_run_time?.[0],
    seasons: (raw.seasons ?? [])
      .filter((s) => s.season_number > 0) // ignoramos "Especiales" (temporada 0)
      .map((s) => ({
        seasonNumber: s.season_number,
        episodeCount: s.episode_count,
        name: s.name,
      })),
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
