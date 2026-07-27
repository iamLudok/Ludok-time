/**
 * DDL del esquema local. Vive aparte de `db.ts` (que importa expo-sqlite, y por
 * tanto solo funciona en el móvil) para que las pruebas de escritorio puedan
 * crear EXACTAMENTE el mismo esquema que crea la app. Si esto estuviera
 * duplicado en el test, el test validaría un esquema que no es el real.
 */
export const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  source TEXT NOT NULL,
  sourceId TEXT,
  title TEXT NOT NULL,
  poster TEXT,
  overview TEXT,
  year INTEGER,
  runtime INTEGER,
  author TEXT,
  url TEXT,
  totalPages INTEGER,
  currentPage INTEGER,
  status TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 0,
  addedAt INTEGER NOT NULL,
  startedAt INTEGER,
  completedAt INTEGER
);

CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY NOT NULL,
  itemId TEXT NOT NULL,
  season INTEGER NOT NULL,
  episode INTEGER NOT NULL,
  title TEXT,
  airDate TEXT,
  runtime INTEGER,
  still TEXT,
  watched INTEGER NOT NULL DEFAULT 0,
  watchedAt INTEGER
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY NOT NULL,
  tmdbApiKey TEXT NOT NULL DEFAULT '',
  googleBooksApiKey TEXT,
  theme TEXT NOT NULL DEFAULT 'system',
  lastBackup INTEGER NOT NULL DEFAULT 0,
  schemaVersion INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS episodes_itemId_idx ON episodes (itemId);
CREATE INDEX IF NOT EXISTS items_type_idx ON items (type);
CREATE INDEX IF NOT EXISTS items_status_idx ON items (status);
`
