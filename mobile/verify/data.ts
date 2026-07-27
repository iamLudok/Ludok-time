/**
 * Verificación de la Fase 1: la ida y vuelta de los datos.
 *
 * Ejecuta el MISMO `backupCore` que corre en el móvil, pero contra un SQLite de
 * escritorio, y el mismo DDL que crea la app. Comprueba que un JSON con el
 * formato exacto de la PWA entra intacto y vuelve a salir igual.
 *
 * Fichero de verificación temporal, no forma parte de la app.
 */
// libsql y no better-sqlite3: better-sqlite3 es sincrónico y no admite
// transacciones asíncronas, mientras expo-sqlite (el del móvil) sí. Con libsql
// la semántica async coincide con la real y se ejecuta el mismo código.
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync } from 'node:fs'
import * as schema from '../src/lib/schema'
import { CREATE_SQL } from '../src/lib/schemaSql'
import { exportAll, importBackup, type LudokDb } from '../src/lib/backupCore'
import type { BackupFile, Item, Episode } from '../src/types'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FALLO'} ${label}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}
function eq<T>(label: string, actual: T, expected: T) {
  check(label, actual === expected, actual === expected ? '' : `esperado ${expected}, salió ${actual}`)
}

// Fichero temporal en vez de ':memory:': una base en memoria NO se comparte
// entre conexiones, y las transacciones abren la suya, así que las tablas
// desaparecían dentro de la transacción. Con fichero se comporta como en el
// móvil, que también usa un fichero.
let dbSeq = 0
async function freshDb(): Promise<LudokDb> {
  const path = join(tmpdir(), `ludok-verify-${process.pid}-${dbSeq++}.db`)
  rmSync(path, { force: true })
  tempFiles.push(path)
  const client = createClient({ url: `file:${path}` })
  await client.executeMultiple(CREATE_SQL)
  return drizzle(client, { schema }) as unknown as LudokDb
}
const tempFiles: string[] = []
function cleanupTempFiles() {
  for (const f of tempFiles) {
    for (const suffix of ['', '-wal', '-shm']) rmSync(f + suffix, { force: true })
  }
}

/* --- Una copia con la forma EXACTA que exporta la PWA -------------------- */

const serieId = 'it-serie-1'
const items: Item[] = [
  {
    id: serieId,
    type: 'series',
    source: 'tmdb',
    sourceId: '1396',
    title: 'Breaking Bad',
    poster: 'https://image.tmdb.org/t/p/w342/abc.jpg',
    overview: 'Un profesor de química…',
    year: 2008,
    runtime: 47,
    status: 'watching',
    rating: 10,
    addedAt: 1700000000000,
    startedAt: 1700000100000,
  },
  {
    id: 'it-peli-1',
    type: 'movie',
    source: 'tmdb',
    sourceId: '27205',
    title: 'Origen',
    year: 2010,
    runtime: 148,
    status: 'completed',
    rating: 9,
    addedAt: 1700000200000,
    completedAt: 1700000300000,
  },
  {
    // Libro a mano: sin sourceId, sin poster — los huecos importan.
    id: 'it-libro-1',
    type: 'book',
    source: 'manual',
    title: 'Berserk 1',
    author: 'Kentaro Miura',
    totalPages: 224,
    currentPage: 100,
    status: 'watching',
    rating: 0,
    addedAt: 1700000400000,
  },
  {
    id: 'it-video-1',
    type: 'youtube',
    source: 'youtube',
    sourceId: 'dQw4w9WgXcQ',
    title: 'Un vídeo',
    author: 'Un canal',
    poster: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    status: 'completed',
    rating: 0,
    addedAt: 1700000500000,
    startedAt: 1699000000000,
    completedAt: 1699000000000,
  },
]

const episodes: Episode[] = [
  {
    id: 'ep-1',
    itemId: serieId,
    season: 1,
    episode: 1,
    title: 'Piloto',
    airDate: '2008-01-20',
    runtime: 58,
    still: 'https://image.tmdb.org/t/p/w185/s1.jpg',
    watched: true,
    watchedAt: 1700000600000,
  },
  {
    // Sin ver y sin fotograma: comprueba false y los huecos.
    id: 'ep-2',
    itemId: serieId,
    season: 1,
    episode: 2,
    title: 'El gato está en la bolsa',
    airDate: '2008-01-27',
    watched: false,
  },
]

const pwaBackup: BackupFile = {
  app: 'ludok-time',
  schemaVersion: 2,
  exportedAt: 1700001000000,
  items,
  episodes,
  settings: {
    id: 'app',
    tmdbApiKey: 'CLAVE_TMDB',
    googleBooksApiKey: 'CLAVE_GB',
    theme: 'dark',
    lastBackup: 1700000900000,
    schemaVersion: 2,
  },
}

async function main() {
  console.log('\n=== 1. Importar el JSON de la PWA ===')
  const db = await freshDb()
  const res = await importBackup(db, JSON.stringify(pwaBackup), 'replace')
  eq('títulos importados', res.items, 4)
  eq('episodios importados', res.episodes, 2)

  console.log('\n=== 2. Los datos cuadran ===')
  const out = await exportAll(db)
  eq('nº de títulos', out.items.length, 4)
  eq('nº de episodios', out.episodes.length, 2)
  eq('episodios vistos', out.episodes.filter((e) => e.watched).length, 1)
  eq('títulos con nota', out.items.filter((i) => i.rating > 0).length, 2)
  eq('API key de TMDB restaurada', out.settings?.tmdbApiKey, 'CLAVE_TMDB')
  eq('API key de Google Books restaurada', out.settings?.googleBooksApiKey, 'CLAVE_GB')
  eq('tema restaurado', out.settings?.theme, 'dark')

  console.log('\n=== 3. Campo a campo, sin pérdidas ===')
  for (const original of items) {
    const back = out.items.find((i) => i.id === original.id)
    if (!back) {
      check(`título ${original.id} presente`, false)
      continue
    }
    const same = JSON.stringify(sorted(original)) === JSON.stringify(sorted(back))
    check(
      `"${original.title}" idéntico`,
      same,
      same ? '' : `\n    antes: ${JSON.stringify(sorted(original))}\n    ahora: ${JSON.stringify(sorted(back))}`,
    )
  }
  for (const original of episodes) {
    const back = out.episodes.find((e) => e.id === original.id)
    if (!back) {
      check(`episodio ${original.id} presente`, false)
      continue
    }
    const same = JSON.stringify(sorted(original)) === JSON.stringify(sorted(back))
    check(
      `episodio S${original.season}E${original.episode} idéntico`,
      same,
      same ? '' : `\n    antes: ${JSON.stringify(sorted(original))}\n    ahora: ${JSON.stringify(sorted(back))}`,
    )
  }

  console.log('\n=== 4. Los huecos siguen siendo huecos (no null) ===')
  const libro = out.items.find((i) => i.id === 'it-libro-1')!
  check('libro a mano sin sourceId', !('sourceId' in stripUndef(libro)))
  check('libro a mano sin poster', !('poster' in stripUndef(libro)))
  const ep2 = out.episodes.find((e) => e.id === 'ep-2')!
  check('episodio sin ver: watched es false booleano', ep2.watched === false)
  check('episodio sin ver sin watchedAt', !('watchedAt' in stripUndef(ep2)))
  check(
    'el JSON exportado no contiene ningún null',
    !JSON.stringify(out).includes('null') || out.settings === null,
    JSON.stringify(out).includes('null') ? 'hay nulls en el fichero' : '',
  )

  console.log('\n=== 5. Fusionar sin mezclar filas (el fallo de excluded) ===')
  const db2 = await freshDb()
  await importBackup(db2, JSON.stringify(pwaBackup), 'replace')
  // Misma serie, mismos ids de episodio, pero títulos y estado cambiados:
  const edited: BackupFile = {
    ...pwaBackup,
    items: [{ ...items[0], title: 'Breaking Bad (editado)', rating: 8 }],
    episodes: [
      { ...episodes[0], title: 'Piloto v2', watched: false, watchedAt: undefined },
      { ...episodes[1], title: 'El gato v2', watched: true, watchedAt: 1700009999000 },
    ],
  }
  await importBackup(db2, JSON.stringify(edited), 'merge')
  const merged = await exportAll(db2)
  eq('sigue habiendo 4 títulos (no se borró nada)', merged.items.length, 4)
  eq('sigue habiendo 2 episodios', merged.episodes.length, 2)
  eq('título actualizado', merged.items.find((i) => i.id === serieId)?.title, 'Breaking Bad (editado)')
  eq('nota actualizada', merged.items.find((i) => i.id === serieId)?.rating, 8)
  // Aquí es donde un `set` con valor fijo habría puesto lo mismo en los dos:
  eq('ep-1 con SU título', merged.episodes.find((e) => e.id === 'ep-1')?.title, 'Piloto v2')
  eq('ep-2 con SU título', merged.episodes.find((e) => e.id === 'ep-2')?.title, 'El gato v2')
  eq('ep-1 desmarcado', merged.episodes.find((e) => e.id === 'ep-1')?.watched, false)
  eq('ep-2 marcado', merged.episodes.find((e) => e.id === 'ep-2')?.watched, true)
  eq('ep-2 con su fecha', merged.episodes.find((e) => e.id === 'ep-2')?.watchedAt, 1700009999000)

  console.log('\n=== 6. Volumen grande (troceado de inserts) ===')
  const db3 = await freshDb()
  const many: Item[] = Array.from({ length: 4000 }, (_, i) => ({
    id: `vid-${i}`,
    type: 'youtube' as const,
    source: 'youtube' as const,
    sourceId: `v${i}`,
    title: `Vídeo ${i}`,
    status: 'completed' as const,
    rating: 0,
    addedAt: 1700000000000 + i,
    completedAt: 1700000000000 + i,
  }))
  const manyEps: Episode[] = Array.from({ length: 3000 }, (_, i) => ({
    id: `bulk-ep-${i}`,
    itemId: serieId,
    season: Math.floor(i / 25) + 1,
    episode: (i % 25) + 1,
    title: `Ep ${i}`,
    watched: i % 2 === 0,
  }))
  const t0 = Date.now()
  const big = await importBackup(
    db3,
    JSON.stringify({ ...pwaBackup, items: [...items, ...many], episodes: manyEps }),
    'replace',
  )
  const ms = Date.now() - t0
  eq('4004 títulos importados', big.items, 4004)
  eq('3000 episodios importados', big.episodes, 3000)
  const bigOut = await exportAll(db3)
  eq('4004 títulos leídos de vuelta', bigOut.items.length, 4004)
  eq('3000 episodios leídos de vuelta', bigOut.episodes.length, 3000)
  eq('1500 vistos', bigOut.episodes.filter((e) => e.watched).length, 1500)
  console.log(`        (${ms} ms)`)

  console.log('\n=== 7. Rechaza lo que no debe aceptar ===')
  await rejects('un JSON inválido', async () =>
    importBackup(await freshDb(), '{no es json', 'replace'),
  )
  await rejects('un JSON que no es de Ludok Time', async () =>
    importBackup(await freshDb(), JSON.stringify({ app: 'otra-cosa', items: [] }), 'replace'),
  )
  await rejects('una copia de una versión más nueva', async () =>
    importBackup(await freshDb(), JSON.stringify({ ...pwaBackup, schemaVersion: 99 }), 'replace'),
  )

  console.log('\n=== 8. La versión del formato sigue siendo la de la web ===')
  eq('schemaVersion exportada', out.schemaVersion, 2)

  console.log(
    failures === 0
      ? '\n✅ TODO CORRECTO — los datos entran y salen sin perder nada\n'
      : `\n❌ ${failures} COMPROBACIONES FALLIDAS\n`,
  )
  cleanupTempFiles()
  process.exit(failures === 0 ? 0 : 1)
}

/** Quita las claves undefined, para comparar solo lo que llega al JSON. */
function stripUndef<T extends object>(o: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(o))
}
/** Normaliza el orden de claves para poder comparar dos objetos como texto. */
function sorted(o: object): Record<string, unknown> {
  const plain = stripUndef(o)
  return Object.fromEntries(Object.keys(plain).sort().map((k) => [k, plain[k]]))
}

async function rejects(label: string, fn: () => Promise<unknown>) {
  try {
    await fn()
    check(`rechaza ${label}`, false, 'no lanzó error')
  } catch {
    check(`rechaza ${label}`, true)
  }
}

main().catch((e) => {
  console.error('\nEl test se rompió:', e)
  process.exit(1)
})
