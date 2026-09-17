// Definición de tablas para Drizzle. Solo describe las columnas: las tablas y
// los índices se crean con SQL explícito en `db.ts` (migraciones por
// PRAGMA user_version), igual que la web usaba versiones de Dexie.
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import type { MediaType, MediaSource, Status } from '../types'

export const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  type: text('type').$type<MediaType>().notNull(),
  source: text('source').$type<MediaSource>().notNull(),
  sourceId: text('sourceId'),
  title: text('title').notNull(),
  poster: text('poster'),
  overview: text('overview'),
  year: integer('year'),
  runtime: integer('runtime'),
  author: text('author'),
  // Sobra desde que se quitaron los vídeos de YouTube, que eran los únicos que
  // la usaban. Se deja: una columna vacía no cuesta nada y borrar columnas en
  // SQLite es de esas operaciones que no compensa arriesgar.
  url: text('url'),
  totalPages: integer('totalPages'),
  currentPage: integer('currentPage'),
  currentChapter: integer('currentChapter'),
  totalChapters: integer('totalChapters'),
  readUrl: text('readUrl'),
  status: text('status').$type<Status>().notNull(),
  rating: integer('rating').notNull().default(0),
  // Nullable a propósito: ausente significa «preguntar», que es lo que quieres
  // por defecto y lo que traen las copias anteriores a esta función.
  askMarkPrevious: integer('askMarkPrevious', { mode: 'boolean' }),
  addedAt: integer('addedAt').notNull(),
  startedAt: integer('startedAt'),
  completedAt: integer('completedAt'),
})

export const episodes = sqliteTable('episodes', {
  id: text('id').primaryKey(),
  itemId: text('itemId').notNull(),
  season: integer('season').notNull(),
  episode: integer('episode').notNull(),
  title: text('title'),
  airDate: text('airDate'),
  runtime: integer('runtime'),
  still: text('still'),
  // SQLite no tiene booleano: se guarda 0/1 y Drizzle lo traduce.
  watched: integer('watched', { mode: 'boolean' }).notNull().default(false),
  watchedAt: integer('watchedAt'),
})

export const people = sqliteTable('people', {
  id: text('id').primaryKey(),
  tmdbId: integer('tmdbId').notNull(),
  name: text('name').notNull(),
  photo: text('photo'),
  addedAt: integer('addedAt').notNull(),
})

export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  tmdbApiKey: text('tmdbApiKey').notNull().default(''),
  // Sobra desde que se quitó la búsqueda por Google Books: mismo motivo que
  // `url` en `items`, se deja para no arriesgar un DROP COLUMN.
  googleBooksApiKey: text('googleBooksApiKey'),
  theme: text('theme').$type<'dark' | 'light' | 'system'>().notNull().default('system'),
  lastBackup: integer('lastBackup').notNull().default(0),
  onboardedAt: integer('onboardedAt'),
  nextcloudUrl: text('nextcloudUrl'),
  nextcloudUser: text('nextcloudUser'),
  nextcloudPassword: text('nextcloudPassword'),
  nextcloudFolder: text('nextcloudFolder'),
  autoBackup: integer('autoBackup', { mode: 'boolean' }),
  lastAutoBackupAt: integer('lastAutoBackupAt'),
  schemaVersion: integer('schemaVersion').notNull(),
})

export type ItemRow = typeof items.$inferSelect
export type EpisodeRow = typeof episodes.$inferSelect
export type PersonRow = typeof people.$inferSelect
export type SettingsRow = typeof settings.$inferSelect
