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
  currentChapter INTEGER,
  totalChapters INTEGER,
  readUrl TEXT,
  status TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 0,
  askMarkPrevious INTEGER,
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
  onboardedAt INTEGER,
  nextcloudUrl TEXT,
  nextcloudUser TEXT,
  nextcloudPassword TEXT,
  nextcloudFolder TEXT,
  autoBackup INTEGER,
  lastAutoBackupAt INTEGER,
  schemaVersion INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY NOT NULL,
  tmdbId INTEGER NOT NULL,
  name TEXT NOT NULL,
  photo TEXT,
  addedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS past_watches (
  id TEXT PRIMARY KEY NOT NULL,
  itemId TEXT NOT NULL,
  episodeId TEXT NOT NULL,
  round INTEGER NOT NULL,
  watchedAt INTEGER
);

CREATE INDEX IF NOT EXISTS episodes_itemId_idx ON episodes (itemId);
CREATE INDEX IF NOT EXISTS past_watches_itemId_idx ON past_watches (itemId);
CREATE UNIQUE INDEX IF NOT EXISTS people_tmdbId_idx ON people (tmdbId);
CREATE INDEX IF NOT EXISTS items_type_idx ON items (type);
CREATE INDEX IF NOT EXISTS items_status_idx ON items (status);
`

/**
 * Cambios de esquema sobre bases ya creadas, en orden. El índice del array + 1
 * es la versión a la que lleva cada paso (`PRAGMA user_version`).
 *
 * `CREATE_SQL` de arriba siempre describe el esquema COMPLETO y actual, así que
 * una instalación nueva no ejecuta ninguno de estos pasos: son solo para bases
 * que ya existían antes del cambio.
 */
export const MIGRATIONS: string[] = [
  // v1 → v2: preferencia por serie de si ofrecer marcar los episodios anteriores.
  `ALTER TABLE items ADD COLUMN askMarkPrevious INTEGER;`,
  // v2 → v3: marca de que ya se pasó la pantalla de bienvenida.
  //
  // A quien ya tenía la app instalada se le da por presentado: la bienvenida
  // explica cosas que esa persona ya sabe, y sería absurdo enseñársela justo
  // después de actualizar. Solo la ven las instalaciones nuevas, que no ejecutan
  // estas migraciones (su esquema sale ya completo de CREATE_SQL).
  `ALTER TABLE settings ADD COLUMN onboardedAt INTEGER;
   UPDATE settings SET onboardedAt = 1 WHERE onboardedAt IS NULL;`,
  // v3 → v4: copia automática a un Nextcloud propio.
  `ALTER TABLE settings ADD COLUMN nextcloudUrl TEXT;
   ALTER TABLE settings ADD COLUMN nextcloudUser TEXT;
   ALTER TABLE settings ADD COLUMN nextcloudPassword TEXT;
   ALTER TABLE settings ADD COLUMN nextcloudFolder TEXT;
   ALTER TABLE settings ADD COLUMN autoBackup INTEGER;
   ALTER TABLE settings ADD COLUMN lastAutoBackupAt INTEGER;`,
  // v4 → v5: fuera los episodios que aún no se han emitido.
  //
  // Se guardaban porque TMDB devuelve las temporadas completas, con los
  // capítulos futuros incluidos. Ensuciaban la lista, dejaban el progreso en
  // 24/25 para siempre y desactivaban el aviso de «próximo episodio». Solo se
  // borran los que están sin ver: si alguno está marcado, manda el usuario.
  `DELETE FROM episodes WHERE watched = 0 AND airDate IS NOT NULL AND airDate > date('now');`,
  // v5 → v6: manga como tipo propio, con capítulos y enlace de lectura.
  `ALTER TABLE items ADD COLUMN currentChapter INTEGER;
   ALTER TABLE items ADD COLUMN totalChapters INTEGER;
   ALTER TABLE items ADD COLUMN readUrl TEXT;`,
  // v6 → v7: actores favoritos. Tabla propia, no un tipo más de `items`.
  `CREATE TABLE IF NOT EXISTS people (
     id TEXT PRIMARY KEY NOT NULL,
     tmdbId INTEGER NOT NULL,
     name TEXT NOT NULL,
     photo TEXT,
     addedAt INTEGER NOT NULL
   );
   CREATE UNIQUE INDEX IF NOT EXISTS people_tmdbId_idx ON people (tmdbId);`,
  // v7 → v8: visionados anteriores, para poder volver a ver una serie sin
  // perder las fechas de la primera vez.
  `CREATE TABLE IF NOT EXISTS past_watches (
     id TEXT PRIMARY KEY NOT NULL,
     itemId TEXT NOT NULL,
     episodeId TEXT NOT NULL,
     round INTEGER NOT NULL,
     watchedAt INTEGER
   );
   CREATE INDEX IF NOT EXISTS past_watches_itemId_idx ON past_watches (itemId);`,
]

/** Versión actual del esquema local. */
export const DB_VERSION = MIGRATIONS.length + 1
