/**
 * Verificación del formato de copia: la ida y vuelta de los datos.
 *
 * Ejecuta el MISMO `backupCore` que corre en el móvil, pero contra un SQLite de
 * escritorio, y el mismo DDL que crea la app.
 *
 * Los datos de prueba tienen la forma exacta que exportaba la versión web, que
 * es de donde vinieron los datos reales: mientras esto pase, una copia guardada
 * de aquella época sigue pudiendo restaurarse.
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
import { people as peopleTable, pastWatches as pastWatchesTable } from '../src/lib/schema'
import { CREATE_SQL } from '../src/lib/schemaSql'
import {
  exportAll,
  importBackup,
  readSettings,
  writeSettings,
  type LudokDb,
} from '../src/lib/backupCore'
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
]

/**
 * Un vídeo de YouTube tal y como lo guardaba una versión anterior. Su tipo ya no
 * existe en el modelo (por eso el cast), y está aquí a propósito: una copia
 * antigua puede traerlos y hay que comprobar que se descartan bien en vez de
 * acabar en la base de datos como filas que nada sabría mostrar.
 */
const legacyVideo = {
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
} as unknown as Item

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
  items: [...items, legacyVideo],
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
  eq('títulos importados (el vídeo no cuenta)', res.items, 3)
  eq('y se descarta el vídeo', res.discardedVideos, 1)
  eq('episodios importados', res.episodes, 2)

  console.log('\n=== 2. Los datos cuadran ===')
  const out = await exportAll(db)
  eq('nº de títulos', out.items.length, 3)
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
  eq('siguen los 3 títulos (no se borró nada)', merged.items.length, 3)
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
    id: `lib-${i}`,
    type: 'book' as const,
    source: 'manual' as const,
    title: `Libro ${i}`,
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
  eq('4003 títulos importados', big.items, 4003)
  eq('3000 episodios importados', big.episodes, 3000)
  const bigOut = await exportAll(db3)
  eq('4003 títulos leídos de vuelta', bigOut.items.length, 4003)
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

  console.log('\n=== 8. La contraseña de Nextcloud NO sale en las copias ===')
  // Una copia se comparte y acaba subida al propio Nextcloud: si llevara dentro
  // la contraseña que da permiso de escritura allí, sería regalar la llave.
  const dbNc = await freshDb()
  await importBackup(dbNc, JSON.stringify(pwaBackup), 'replace')
  await writeSettings(dbNc, {
    ...(await readSettings(dbNc)),
    nextcloudUrl: 'https://cloud.example.com',
    nextcloudUser: 'luken',
    nextcloudPassword: 'SECRETO-QUE-NO-DEBE-SALIR',
    nextcloudFolder: 'Ludok Time',
    autoBackup: true,
  })
  const exported = await exportAll(dbNc)
  const asText = JSON.stringify(exported)
  check('el texto de la copia no contiene la contraseña', !asText.includes('SECRETO-QUE-NO-DEBE-SALIR'))
  eq('ni el campo existe', exported.settings?.nextcloudPassword, undefined)
  // Lo que no es secreto sí se conserva, para no tener que reconfigurarlo entero.
  eq('la dirección sí se guarda', exported.settings?.nextcloudUrl, 'https://cloud.example.com')
  eq('el usuario también', exported.settings?.nextcloudUser, 'luken')
  eq('y la preferencia de subida sola', exported.settings?.autoBackup, true)
  // Y al importar en otro móvil, la contraseña de ese móvil no se pisa con nada.
  const dbOtro = await freshDb()
  await writeSettings(dbOtro, { ...(await readSettings(dbOtro)), nextcloudPassword: 'LA-MIA' })
  await importBackup(dbOtro, JSON.stringify(exported), 'replace')
  eq('no borra la contraseña ya guardada', (await readSettings(dbOtro)).nextcloudPassword, 'LA-MIA')

  console.log('\n=== 9. Actores favoritos en la copia ===')
  const dbP = await freshDb()
  await importBackup(dbP, JSON.stringify(pwaBackup), 'replace')
  await dbP.insert(peopleTable).values([
    { id: 'p1', tmdbId: 12214, name: 'Gillian Anderson', photo: 'https://x/g.jpg', addedAt: 1 },
    { id: 'p2', tmdbId: 2201315, name: 'Emma Mackey', photo: null, addedAt: 2 },
  ])
  const conGente = await exportAll(dbP)
  eq('salen los dos en la copia', conGente.people?.length, 2)
  eq('con su id de TMDB', conGente.people?.find((p) => p.id === 'p1')?.tmdbId, 12214)
  // Sin foto tiene que quedar AUSENTE, no null: el fichero mantiene su forma.
  const sinFoto = JSON.parse(JSON.stringify(conGente.people?.find((p) => p.id === 'p2')))
  check('sin foto, el campo ni aparece', !('photo' in sinFoto))

  // Y vuelven a entrar tal cual.
  const dbP2 = await freshDb()
  const res2 = await importBackup(dbP2, JSON.stringify(conGente), 'replace')
  eq('se importan los dos', res2.people, 2)
  const vuelta = await exportAll(dbP2)
  eq('siguen siendo dos', vuelta.people?.length, 2)
  eq('con su nombre', vuelta.people?.find((p) => p.tmdbId === 12214)?.name, 'Gillian Anderson')

  // Una copia ANTERIOR a los favoritos no trae la lista: no debe romper nada.
  const dbViejo = await freshDb()
  const resViejo = await importBackup(dbViejo, JSON.stringify(pwaBackup), 'replace')
  eq('una copia antigua importa con 0 actores', resViejo.people, 0)
  eq('y sus títulos entran igual', resViejo.items, 3)

  console.log('\n=== 9b. Visionados anteriores en la copia ===')
  const dbV = await freshDb()
  await importBackup(dbV, JSON.stringify(pwaBackup), 'replace')
  await dbV.insert(pastWatchesTable).values([
    { id: 'pw1', itemId: 'it-serie-1', episodeId: 'ep-1', round: 1, watchedAt: 1600000000000 },
    { id: 'pw2', itemId: 'it-serie-1', episodeId: 'ep-2', round: 1, watchedAt: null },
  ])
  const conHistorial = await exportAll(dbV)
  eq('salen las dos marcas', conHistorial.pastWatches?.length, 2)
  eq('con su fecha', conHistorial.pastWatches?.find((w) => w.id === 'pw1')?.watchedAt, 1600000000000)
  const sinFecha = JSON.parse(JSON.stringify(conHistorial.pastWatches?.find((w) => w.id === 'pw2')))
  check('sin fecha, el campo ni aparece', !('watchedAt' in sinFecha))

  const dbV2 = await freshDb()
  const resV = await importBackup(dbV2, JSON.stringify(conHistorial), 'replace')
  eq('se importan las dos', resV.pastWatches, 2)
  const vueltaV = await exportAll(dbV2)
  eq('y vuelven a salir igual', JSON.stringify(vueltaV.pastWatches), JSON.stringify(conHistorial.pastWatches))
  // Fusionar dos veces la misma copia no duplica el historial.
  await importBackup(dbV2, JSON.stringify(conHistorial), 'merge')
  eq('fusionar no duplica', (await exportAll(dbV2)).pastWatches?.length, 2)
  // Restaurar (replace) una copia sin historial lo vacía, como todo lo demás.
  await importBackup(dbV2, JSON.stringify(pwaBackup), 'replace')
  eq('restaurar una copia antigua deja el historial vacío', (await exportAll(dbV2)).pastWatches?.length, 0)

  console.log('\n=== 10. La versión del formato sigue siendo la de la web ===')
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
