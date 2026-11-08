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

/** Explorar por categoría: `/discover`, ordenado por popularidad. */
export async function discover(
  kind: 'movie' | 'tv',
  genreIds: number[],
  page = 1,
): Promise<TmdbSearchResult[]> {
  const data = await tmdbFetch<RawMulti>(`/discover/${kind}`, {
    with_genres: genreIds.join(','),
    sort_by: 'popularity.desc',
    include_adult: 'false',
    page: String(page),
  })
  return data.results.map((r) => ({
    id: r.id,
    mediaType: kind,
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
  /** Código ISO 639-1 del idioma original ('ja', 'ko', 'en'…). */
  originalLanguage?: string
  /** Nota media de la comunidad de TMDB (0–10). */
  voteAverage?: number
  voteCount?: number
  genres?: string[]
}

export async function getMovie(id: number): Promise<TmdbMovie> {
  const raw = await tmdbFetch<{
    id: number
    title: string
    poster_path?: string | null
    overview?: string
    release_date?: string
    runtime?: number
    original_language?: string
  }>(`/movie/${id}`)
  return {
    id: raw.id,
    title: raw.title,
    posterPath: raw.poster_path ?? undefined,
    overview: raw.overview,
    year: yearFrom(raw.release_date),
    runtime: raw.runtime,
    originalLanguage: raw.original_language,
  }
}

export interface TmdbSeason {
  seasonNumber: number
  episodeCount: number
  name: string
  /**
   * Fecha de estreno DE LA TEMPORADA, no de cada episodio. Ausente cuando TMDB
   * ni siquiera tiene decidido cuándo empieza: la señal de que es una
   * temporada "plantilla" (la serie se renovó, pero no hay nada real todavía).
   */
  airDate?: string
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
  /** Nota media de la comunidad de TMDB (0–10). */
  voteAverage?: number
  /** Cuántos han votado, para saber si esa nota significa algo. */
  voteCount?: number
  /** Géneros, ya traducidos. */
  genres: string[]
  /** Cadenas que la emiten. */
  networks: string[]
  /**
   * Último episodio EMITIDO según TMDB. Sirve para detectar que hay capítulos
   * nuevos que aún no tienes guardados, sin depender de la cuenta atrás.
   */
  lastEpisode?: TmdbNextEpisode
  /** Próximo episodio a emitir, si la serie sigue en emisión y TMDB lo sabe. */
  nextEpisode?: TmdbNextEpisode
  /**
   * Si la serie sigue en producción. OJO: usar esto y no `status` para saber
   * si "ya terminó": pedimos los datos en es-ES y TMDB traduce `status`
   * ("Ended" → "Finalizada"), así que compararlo con los textos en inglés
   * nunca coincide de forma fiable. `in_production` es un booleano y no se
   * traduce.
   */
  inProduction?: boolean
  /** Código ISO 639-1 del idioma original ('ja', 'ko', 'en'…). */
  originalLanguage?: string
}

interface RawEpisodeRef {
  season_number: number
  episode_number: number
  name?: string
  air_date?: string
}

interface RawSeries {
  id: number
  name: string
  poster_path?: string | null
  overview?: string
  first_air_date?: string
  episode_run_time?: number[]
  in_production?: boolean
  original_language?: string
  vote_average?: number
  vote_count?: number
  genres?: Array<{ name: string }>
  networks?: Array<{ name: string }>
  seasons?: Array<{
    season_number: number
    episode_count: number
    name: string
    air_date?: string | null
  }>
  next_episode_to_air?: RawEpisodeRef | null
  last_episode_to_air?: RawEpisodeRef | null
}

function episodeRef(raw: RawEpisodeRef | null | undefined): TmdbNextEpisode | undefined {
  if (!raw) return undefined
  return {
    season: raw.season_number,
    episode: raw.episode_number,
    title: raw.name,
    airDate: raw.air_date,
  }
}

function toSeries(raw: RawSeries): TmdbSeries {
  return {
    id: raw.id,
    title: raw.name,
    posterPath: raw.poster_path ?? undefined,
    overview: raw.overview,
    year: yearFrom(raw.first_air_date),
    episodeRuntime: raw.episode_run_time?.[0],
    inProduction: raw.in_production,
    originalLanguage: raw.original_language,
    voteAverage: raw.vote_average,
    voteCount: raw.vote_count,
    genres: (raw.genres ?? []).map((g) => g.name),
    networks: (raw.networks ?? []).map((n) => n.name),
    seasons: (raw.seasons ?? [])
      .filter((s) => s.season_number > 0) // ignoramos "Especiales" (temporada 0)
      .map((s) => ({
        seasonNumber: s.season_number,
        episodeCount: s.episode_count,
        name: s.name,
        airDate: s.air_date ?? undefined,
      })),
    nextEpisode: episodeRef(raw.next_episode_to_air),
    lastEpisode: episodeRef(raw.last_episode_to_air),
  }
}

export async function getSeries(id: number): Promise<TmdbSeries> {
  return toSeries(await tmdbFetch<RawSeries>(`/tv/${id}`))
}

export interface TmdbCastMember {
  /** id de la persona en TMDB: por aquí se pide su perfil. */
  id: number
  name: string
  /** El personaje que hace, si TMDB lo tiene. */
  character?: string
  photoPath?: string
  /** Solo en series: en cuántos episodios sale. */
  episodeCount?: number
}

interface RawCast {
  cast?: Array<{
    id: number
    name: string
    character?: string
    profile_path?: string | null
    /** Las series lo dan agregado por temporadas, con un rol por personaje. */
    roles?: Array<{ character?: string; episode_count?: number }>
  }>
}

/**
 * Normaliza el reparto de series y películas, que TMDB devuelve distinto.
 *
 * En películas cada actor trae `character` directamente. En series viene
 * `aggregate_credits`, que agrupa por temporadas y mete los personajes en un
 * array `roles`: un mismo actor puede hacer varios papeles en la misma serie.
 */
function toCast(raw: RawCast | undefined): TmdbCastMember[] {
  return (raw?.cast ?? []).map((c) => {
    const role = c.roles?.[0]
    return {
      id: c.id,
      name: c.name,
      character: role?.character ?? c.character,
      photoPath: c.profile_path ?? undefined,
      episodeCount: role?.episode_count,
    }
  })
}

/** Todo lo que hace falta para pintar una ficha, junto. */
export interface TmdbSeriesFull {
  series: TmdbSeries
  providers: WatchProviders
  /**
   * «También te puede gustar». Sale de `/recommendations`, NO de `/similar`.
   * `/similar` empareja por género y mezclaba cosas como Star Wars Rebels con
   * Kuroko no Basket, solo por compartir la etiqueta "animación". `/recommendations`
   * va por patrones de audiencia real (quien vio esto también vio aquello): para lo
   * mismo da Slam Dunk, All Out!! (rugby), Ookiku Furikabutte (béisbol): género y
   * origen correctos sin filtrar nada a mano. Misma forma de datos que `/similar`
   * (por eso se reutiliza `RawSimilar`/`toSimilar`), solo cambia de dónde sale.
   */
  similar: TmdbSimilar[]
  cast: TmdbCastMember[]
}

/**
 * Ficha de serie en UNA sola petición.
 *
 * `append_to_response` deja pedir varios recursos del mismo id de golpe. Antes
 * abrir una serie disparaba tres peticiones (datos, dónde verla, recomendadas) que
 * salían a la vez y competían entre sí; en datos móviles se notaba.
 */
export async function getSeriesFull(id: number, region = 'ES'): Promise<TmdbSeriesFull> {
  const raw = await tmdbFetch<
    RawSeries & {
      'watch/providers'?: RawWatchProviders
      recommendations?: RawSimilar
      aggregate_credits?: RawCast
    }
  >(`/tv/${id}`, { append_to_response: 'watch/providers,recommendations,aggregate_credits' })

  return {
    series: toSeries(raw),
    providers: toProviders(raw['watch/providers'], region),
    similar: toSimilar(raw.recommendations),
    cast: toCast(raw.aggregate_credits),
  }
}

export interface TmdbEpisode {
  season: number
  episode: number
  title?: string
  airDate?: string
  runtime?: number
  stillPath?: string
}

export async function getSeasonEpisodes(seriesId: number, season: number): Promise<TmdbEpisode[]> {
  const raw = await tmdbFetch<{
    episodes?: Array<{
      season_number: number
      episode_number: number
      name?: string
      air_date?: string
      runtime?: number
      still_path?: string | null
    }>
  }>(`/tv/${seriesId}/season/${season}`)
  return (raw.episodes ?? []).map((e) => ({
    season: e.season_number,
    episode: e.episode_number,
    title: e.name,
    airDate: e.air_date,
    runtime: e.runtime,
    stillPath: e.still_path ?? undefined,
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

interface RawWatchProviders {
  results?: Record<
    string,
    { link?: string; flatrate?: RawProvider[]; rent?: RawProvider[]; buy?: RawProvider[] }
  >
}

function toProviders(raw: RawWatchProviders | undefined, region: string): WatchProviders {
  const forRegion = raw?.results?.[region]
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
  return toProviders(await tmdbFetch<RawWatchProviders>(`/${kind}/${id}/watch/providers`), region)
}

export interface TmdbSimilar {
  id: number
  title: string
  posterPath?: string
  year?: number
  originalLanguage?: string
}

interface RawSimilar {
  results?: Array<{
    id: number
    title?: string
    name?: string
    poster_path?: string | null
    release_date?: string
    first_air_date?: string
    original_language?: string
  }>
}

function toSimilar(raw: RawSimilar | undefined): TmdbSimilar[] {
  return (raw?.results ?? []).map((r) => ({
    id: r.id,
    title: r.title || r.name || '(sin título)',
    posterPath: r.poster_path ?? undefined,
    year: yearFrom(r.release_date || r.first_air_date),
    originalLanguage: r.original_language,
  }))
}

/**
 * Recomendaciones de TMDB para un título suelto («quien vio esto, también vio
 * aquello») sin el resto de la ficha. La usa el motor de recomendaciones de la
 * pestaña «Recomendados», que pregunta por varios títulos de golpe y no
 * necesita el reparto ni dónde verla de cada uno.
 */
export async function getRecommendations(id: number, kind: 'movie' | 'tv'): Promise<TmdbSimilar[]> {
  return toSimilar(await tmdbFetch<RawSimilar>(`/${kind}/${id}/recommendations`))
}

/** Todo lo que hace falta para pintar una ficha de película, junto. */
export interface TmdbMovieFull {
  movie: TmdbMovie
  providers: WatchProviders
  similar: TmdbSimilar[]
  cast: TmdbCastMember[]
}

/** Ficha de película en UNA sola petición, igual que la de serie. */
export async function getMovieFull(id: number, region = 'ES'): Promise<TmdbMovieFull> {
  const raw = await tmdbFetch<{
    id: number
    title: string
    poster_path?: string | null
    overview?: string
    release_date?: string
    runtime?: number
    original_language?: string
    vote_average?: number
    vote_count?: number
    genres?: Array<{ name: string }>
    'watch/providers'?: RawWatchProviders
    recommendations?: RawSimilar
    credits?: RawCast
  }>(`/movie/${id}`, { append_to_response: 'watch/providers,recommendations,credits' })

  return {
    movie: {
      id: raw.id,
      title: raw.title,
      posterPath: raw.poster_path ?? undefined,
      overview: raw.overview,
      year: yearFrom(raw.release_date),
      runtime: raw.runtime,
      originalLanguage: raw.original_language,
      voteAverage: raw.vote_average,
      voteCount: raw.vote_count,
      genres: (raw.genres ?? []).map((g) => g.name),
    },
    providers: toProviders(raw['watch/providers'], region),
    similar: toSimilar(raw.recommendations),
    cast: toCast(raw.credits),
  }
}

/* --- Personas -------------------------------------------------------------- */

export interface TmdbPerson {
  id: number
  name: string
  photoPath?: string
  biography?: string
  /** 'Acting', 'Directing'… tal y como lo traduce TMDB. */
  knownFor?: string
  birthday?: string
  placeOfBirth?: string
}

/** Un trabajo suyo: una serie o una película. */
export interface TmdbPersonCredit {
  id: number
  mediaType: 'movie' | 'tv'
  title: string
  posterPath?: string
  /** Estreno o primera emisión, 'YYYY-MM-DD'. Puede faltar en lo no anunciado. */
  date?: string
  character?: string
}

export interface TmdbPersonFull {
  person: TmdbPerson
  credits: TmdbPersonCredit[]
}

interface RawPersonCredit {
  id: number
  media_type?: string
  title?: string
  name?: string
  poster_path?: string | null
  release_date?: string
  first_air_date?: string
  character?: string
}

/**
 * Perfil de una persona con toda su filmografía, en una sola petición.
 *
 * `combined_credits` mezcla cine y televisión, que es justo lo que se quiere
 * enseñar en su perfil: pedir `movie_credits` y `tv_credits` por separado serían
 * dos peticiones para acabar juntándolas aquí de todas formas.
 */
export async function getPersonFull(id: number): Promise<TmdbPersonFull> {
  const raw = await tmdbFetch<{
    id: number
    name: string
    profile_path?: string | null
    biography?: string
    known_for_department?: string
    birthday?: string | null
    place_of_birth?: string | null
    combined_credits?: { cast?: RawPersonCredit[] }
  }>(`/person/${id}`, { append_to_response: 'combined_credits' })

  const credits: TmdbPersonCredit[] = (raw.combined_credits?.cast ?? [])
    .filter((c) => c.media_type === 'movie' || c.media_type === 'tv')
    .map((c) => ({
      id: c.id,
      mediaType: c.media_type as 'movie' | 'tv',
      title: c.title || c.name || '(sin título)',
      posterPath: c.poster_path ?? undefined,
      date: c.release_date || c.first_air_date || undefined,
      character: c.character || undefined,
    }))
    // Lo más reciente primero; lo que no tiene fecha, al final.
    .sort((a, b) => {
      if (!a.date) return 1
      if (!b.date) return -1
      return b.date.localeCompare(a.date)
    })

  return {
    person: {
      id: raw.id,
      name: raw.name,
      photoPath: raw.profile_path ?? undefined,
      biography: raw.biography || undefined,
      knownFor: raw.known_for_department,
      birthday: raw.birthday ?? undefined,
      placeOfBirth: raw.place_of_birth ?? undefined,
    },
    credits,
  }
}
