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
  url: text('url'),
  totalPages: integer('totalPages'),
  currentPage: integer('currentPage'),
  status: text('status').$type<Status>().notNull(),
  rating: integer('rating').notNull().default(0),
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

export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  tmdbApiKey: text('tmdbApiKey').notNull().default(''),
  googleBooksApiKey: text('googleBooksApiKey'),
  theme: text('theme').$type<'dark' | 'light' | 'system'>().notNull().default('system'),
  lastBackup: integer('lastBackup').notNull().default(0),
  schemaVersion: integer('schemaVersion').notNull(),
})

export type ItemRow = typeof items.$inferSelect
export type EpisodeRow = typeof episodes.$inferSelect
export type SettingsRow = typeof settings.$inferSelect
