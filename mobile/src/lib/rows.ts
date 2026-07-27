// Traducción entre las filas de SQLite y el modelo de dominio.
//
// SQLite devuelve `null` en las columnas vacías, pero los tipos de la app (y el
// formato de las copias) usan `undefined`, que `JSON.stringify` elimina. Pasar
// de uno a otro explícitamente es lo que mantiene los ficheros de copia con la
// misma forma exacta que los que genera la web.
import { SCHEMA_VERSION } from './version'
import type { items, episodes, settings, ItemRow, EpisodeRow, SettingsRow } from './schema'
import type { Item, Episode, Settings } from '../types'

type ItemInsert = typeof items.$inferInsert
type EpisodeInsert = typeof episodes.$inferInsert
type SettingsInsert = typeof settings.$inferInsert

/** null → undefined */
const u = <T>(v: T | null): T | undefined => (v === null ? undefined : v)
/** undefined → null */
const n = <T>(v: T | undefined): T | null => (v === undefined ? null : v)

export function rowToItem(r: ItemRow): Item {
  return {
    id: r.id,
    type: r.type,
    source: r.source,
    sourceId: u(r.sourceId),
    title: r.title,
    poster: u(r.poster),
    overview: u(r.overview),
    year: u(r.year),
    runtime: u(r.runtime),
    author: u(r.author),
    url: u(r.url),
    totalPages: u(r.totalPages),
    currentPage: u(r.currentPage),
    status: r.status,
    rating: r.rating,
    addedAt: r.addedAt,
    startedAt: u(r.startedAt),
    completedAt: u(r.completedAt),
  }
}

export function itemToRow(i: Item): ItemInsert {
  return {
    id: i.id,
    type: i.type,
    source: i.source,
    sourceId: n(i.sourceId),
    title: i.title,
    poster: n(i.poster),
    overview: n(i.overview),
    year: n(i.year),
    runtime: n(i.runtime),
    author: n(i.author),
    url: n(i.url),
    totalPages: n(i.totalPages),
    currentPage: n(i.currentPage),
    status: i.status,
    rating: i.rating ?? 0,
    addedAt: i.addedAt,
    startedAt: n(i.startedAt),
    completedAt: n(i.completedAt),
  }
}

export function rowToEpisode(r: EpisodeRow): Episode {
  return {
    id: r.id,
    itemId: r.itemId,
    season: r.season,
    episode: r.episode,
    title: u(r.title),
    airDate: u(r.airDate),
    runtime: u(r.runtime),
    still: u(r.still),
    watched: r.watched,
    watchedAt: u(r.watchedAt),
  }
}

export function episodeToRow(e: Episode): EpisodeInsert {
  return {
    id: e.id,
    itemId: e.itemId,
    season: e.season,
    episode: e.episode,
    title: n(e.title),
    airDate: n(e.airDate),
    runtime: n(e.runtime),
    still: n(e.still),
    watched: !!e.watched,
    watchedAt: n(e.watchedAt),
  }
}

export function rowToSettings(r: SettingsRow): Settings {
  return {
    id: 'app',
    tmdbApiKey: r.tmdbApiKey,
    googleBooksApiKey: u(r.googleBooksApiKey),
    theme: r.theme,
    lastBackup: r.lastBackup,
    schemaVersion: r.schemaVersion,
  }
}

export function settingsToRow(s: Settings): SettingsInsert {
  return {
    id: 'app',
    tmdbApiKey: s.tmdbApiKey,
    googleBooksApiKey: n(s.googleBooksApiKey),
    theme: s.theme,
    lastBackup: s.lastBackup,
    schemaVersion: s.schemaVersion ?? SCHEMA_VERSION,
  }
}
