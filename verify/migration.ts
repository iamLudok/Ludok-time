/**
 * Verificación de las migraciones de esquema.
 *
 * Importa porque puede haber ya una instalación con datos: si un `ALTER TABLE`
 * falla, la app no arranca. Se recrea el esquema tal y como estaba en la versión
 * anterior, se aplican los pasos y se comprueba que la columna nueva existe y
 * que NO se ha perdido nada de lo que había.
 */
import { createClient, type Client } from '@libsql/client'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync } from 'node:fs'
import { CREATE_SQL, MIGRATIONS, DB_VERSION } from '../src/lib/schemaSql'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FALLO'} ${label}${detail ? ': ' + detail : ''}`)
  if (!ok) failures++
}
function eq<T>(label: string, actual: T, expected: T) {
  check(label, actual === expected, actual === expected ? '' : `esperado ${expected}, salió ${actual}`)
}

/** El esquema tal y como se instaló en la v1, SIN la columna askMarkPrevious. */
const V1_SQL = `
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
`

const files: string[] = []
function tmpFile(name: string): string {
  const path = join(tmpdir(), `ludok-mig-${process.pid}-${name}.db`)
  for (const s of ['', '-wal', '-shm']) rmSync(path + s, { force: true })
  files.push(path)
  return path
}
function cleanup() {
  for (const f of files) for (const s of ['', '-wal', '-shm']) rmSync(f + s, { force: true })
}

/** Reproduce exactamente lo que hace `migrateSync()` en `src/lib/db.ts`. */
async function migrate(client: Client): Promise<void> {
  const row = await client.execute('PRAGMA user_version')
  const current = Number(row.rows[0]?.user_version ?? 0)
  if (current >= DB_VERSION) return

  await client.executeMultiple(CREATE_SQL)
  if (current > 0) {
    for (const step of MIGRATIONS.slice(current - 1)) {
      await client.executeMultiple(step)
    }
  }
  await client.execute(`PRAGMA user_version = ${DB_VERSION}`)
}

async function columns(client: Client, table: string): Promise<string[]> {
  const res = await client.execute(`PRAGMA table_info(${table})`)
  return res.rows.map((r) => String(r.name))
}

async function main() {
  console.log('\n=== 1. Instalación NUEVA: el esquema ya viene completo ===')
  const fresh = createClient({ url: `file:${tmpFile('fresh')}` })
  await migrate(fresh)
  const freshCols = await columns(fresh, 'items')
  check('items tiene askMarkPrevious', freshCols.includes('askMarkPrevious'))
  const v = await fresh.execute('PRAGMA user_version')
  eq('user_version al día', Number(v.rows[0]?.user_version), DB_VERSION)

  console.log('\n=== 2. Instalación ANTIGUA con datos: se migra sin perder nada ===')
  const old = createClient({ url: `file:${tmpFile('old')}` })
  await old.executeMultiple(V1_SQL)
  await old.execute('PRAGMA user_version = 1')
  check('antes NO tenía la columna', !(await columns(old, 'items')).includes('askMarkPrevious'))

  // Datos como los que ya podrías tener en el móvil.
  await old.execute({
    sql: `INSERT INTO items (id,type,source,sourceId,title,status,rating,addedAt,completedAt)
          VALUES (?,?,?,?,?,?,?,?,?)`,
    args: ['s1', 'series', 'tmdb', '1396', 'Kuroko no Basket', 'completed', 10, 1700000000000, 1700000900000],
  })
  await old.execute({
    sql: `INSERT INTO episodes (id,itemId,season,episode,title,watched,watchedAt)
          VALUES (?,?,?,?,?,?,?)`,
    args: ['e1', 's1', 1, 1, 'Soy Kuroko', 1, 1700000600000],
  })
  await old.execute({
    sql: `INSERT INTO settings (id,tmdbApiKey,theme,lastBackup,schemaVersion) VALUES (?,?,?,?,?)`,
    args: ['app', 'CLAVE', 'dark', 1700000900000, 2],
  })

  await migrate(old)

  check('ahora SÍ tiene la columna', (await columns(old, 'items')).includes('askMarkPrevious'))
  const item = await old.execute('SELECT * FROM items WHERE id = ?1', ['s1'] as never)
  eq('el título sigue ahí', String(item.rows[0]?.title), 'Kuroko no Basket')
  eq('la nota sigue ahí', Number(item.rows[0]?.rating), 10)
  eq('la fecha de completada sigue ahí', Number(item.rows[0]?.completedAt), 1700000900000)
  eq('la columna nueva arranca vacía (= preguntar)', item.rows[0]?.askMarkPrevious, null)

  const ep = await old.execute('SELECT * FROM episodes')
  eq('el episodio sigue ahí', ep.rows.length, 1)
  eq('y sigue marcado como visto', Number(ep.rows[0]?.watched), 1)
  eq('con su fecha', Number(ep.rows[0]?.watchedAt), 1700000600000)

  const st = await old.execute('SELECT * FROM settings')
  eq('la API key sigue ahí', String(st.rows[0]?.tmdbApiKey), 'CLAVE')

  console.log('\n=== 3. La bienvenida solo sale en instalaciones nuevas ===')
  // Quien actualiza ya conoce la app: enseñarle la bienvenida sería absurdo.
  const migratedSettings = await old.execute('SELECT onboardedAt FROM settings')
  check(
    'al actualizar queda marcada como vista',
    migratedSettings.rows[0]?.onboardedAt !== null,
    `onboardedAt = ${migratedSettings.rows[0]?.onboardedAt}`,
  )
  // En una instalación nueva la fila de ajustes la crea `ensureSettings`, sin
  // esa marca, así que la bienvenida sí aparece.
  await fresh.execute({
    sql: `INSERT INTO settings (id,tmdbApiKey,theme,lastBackup,schemaVersion) VALUES (?,?,?,?,?)`,
    args: ['app', '', 'system', 0, 2],
  })
  const freshSettings = await fresh.execute('SELECT onboardedAt FROM settings')
  eq('en una instalación nueva NO está marcada', freshSettings.rows[0]?.onboardedAt, null)

  console.log('\n=== 4. Columnas de Nextcloud tras migrar ===')
  const settingsCols = await columns(old, 'settings')
  for (const c of [
    'nextcloudUrl',
    'nextcloudUser',
    'nextcloudPassword',
    'nextcloudFolder',
    'autoBackup',
    'lastAutoBackupAt',
  ]) {
    check(`settings tiene ${c}`, settingsCols.includes(c))
  }
  const st2 = await old.execute('SELECT * FROM settings')
  eq('la copia automática arranca apagada', st2.rows[0]?.autoBackup, null)
  eq('y la API key sigue intacta tras dos migraciones', String(st2.rows[0]?.tmdbApiKey), 'CLAVE')

  console.log('\n=== 5. La migración quita los episodios sin emitir ===')
  // Es la que arregla lo que ya está guardado en el móvil: TMDB devolvía las
  // temporadas completas y se colaban capítulos que aún no habían salido.
  const conFuturos = createClient({ url: `file:${tmpFile('futuros')}` })
  await conFuturos.executeMultiple(V1_SQL)
  await conFuturos.execute('PRAGMA user_version = 1')
  const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const eps: [string, string | null, number][] = [
    ['emitido', ayer, 0],
    ['sin-fecha', null, 0],
    ['futuro', manana, 0],
    ['futuro-pero-visto', manana, 1],
  ]
  for (const [id, fecha, visto] of eps) {
    await conFuturos.execute({
      sql: `INSERT INTO episodes (id,itemId,season,episode,airDate,watched) VALUES (?,?,?,?,?,?)`,
      args: [id, 's1', 1, 1, fecha, visto],
    })
  }
  await migrate(conFuturos)

  const tras = await conFuturos.execute('SELECT id FROM episodes ORDER BY id')
  const ids = tras.rows.map((r) => String(r.id))
  check('se queda el emitido', ids.includes('emitido'))
  check('se queda el que no tiene fecha', ids.includes('sin-fecha'))
  check('se va el que no ha salido', !ids.includes('futuro'))
  check('PERO se queda el marcado como visto', ids.includes('futuro-pero-visto'))
  eq('quedan 3 de 4', ids.length, 3)

  console.log('\n=== 6. Columnas de manga tras migrar (se quedan aunque se quitara el manga) ===')
  const itemCols = await columns(old, 'items')
  for (const c of ['currentChapter', 'totalChapters', 'readUrl']) {
    check(`items tiene ${c}`, itemCols.includes(c))
  }
  // Y lo de siempre: lo que ya había sigue intacto tras cinco migraciones.
  const item2 = await old.execute('SELECT * FROM items WHERE id = ?1', ['s1'] as never)
  eq('el título aguanta 5 migraciones', String(item2.rows[0]?.title), 'Kuroko no Basket')
  eq('y la nota también', Number(item2.rows[0]?.rating), 10)

  console.log('\n=== 7. La tabla de actores se crea al migrar ===')
  const tablas = await conFuturos.execute("SELECT name FROM sqlite_master WHERE type='table'")
  check(
    'existe la tabla people',
    tablas.rows.map((r) => String(r.name)).includes('people'),
  )
  // Y su índice único, que es lo que impide marcar dos veces al mismo actor.
  const idx = await conFuturos.execute("SELECT name FROM sqlite_master WHERE type='index'")
  check(
    'con su índice único por tmdbId',
    idx.rows.map((r) => String(r.name)).includes('people_tmdbId_idx'),
  )
  await conFuturos.execute({
    sql: 'INSERT INTO people (id,tmdbId,name,addedAt) VALUES (?,?,?,?)',
    args: ['p1', 12214, 'Gillian Anderson', 1],
  })
  let duplicado = false
  try {
    await conFuturos.execute({
      sql: 'INSERT INTO people (id,tmdbId,name,addedAt) VALUES (?,?,?,?)',
      args: ['p2', 12214, 'Gillian otra vez', 2],
    })
  } catch {
    duplicado = true
  }
  check('el mismo actor dos veces lo rechaza la base', duplicado)

  console.log('\n=== 7b. La tabla de visionados anteriores se crea al migrar ===')
  check(
    'existe la tabla past_watches',
    tablas.rows.map((r) => String(r.name)).includes('past_watches'),
  )
  check(
    'con su índice por serie',
    idx.rows.map((r) => String(r.name)).includes('past_watches_itemId_idx'),
  )
  const pastCols = await columns(conFuturos, 'past_watches')
  for (const c of ['id', 'itemId', 'episodeId', 'round', 'watchedAt']) {
    check(`past_watches tiene ${c}`, pastCols.includes(c))
  }
  const item3 = await conFuturos.execute('SELECT COUNT(*) AS n FROM episodes')
  check('los episodios siguen ahí tras migrar', Number(item3.rows[0]?.n) > 0)

  console.log('\n=== 8. Migrar dos veces no rompe nada ===')
  await migrate(old)
  const again = await old.execute('SELECT * FROM items')
  eq('sigue habiendo un título', again.rows.length, 1)
  const v2 = await old.execute('PRAGMA user_version')
  eq('y la versión no se mueve', Number(v2.rows[0]?.user_version), DB_VERSION)

  console.log(
    failures === 0
      ? '\n✅ LA MIGRACIÓN ES SEGURA: nada se pierde al actualizar\n'
      : `\n❌ ${failures} COMPROBACIONES FALLIDAS\n`,
  )
  cleanup()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('\nEl test se rompió:', e)
  cleanup()
  process.exit(1)
})
