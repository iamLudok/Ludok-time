/**
 * Verificación de la Fase 2: que las reglas de negocio portadas de la web
 * siguen comportándose igual.
 *
 * Ejecuta el `library.ts` real (el mismo que corre en el móvil) contra un
 * SQLite de escritorio, gracias a que la base de datos se pide por `dbRef`.
 * No toca TMDB: aquí se comprueban las reglas locales, que son las que tienen
 * la lógica sutil y las que romperían datos si se portaron mal.
 */
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync } from 'node:fs'
import * as schema from '../src/lib/schema'
import { CREATE_SQL } from '../src/lib/schemaSql'
import { setDb, getDb } from '../src/lib/dbRef'
import type { LudokDb } from '../src/lib/backupCore'
import { items as itemsTable, episodes as episodesTable } from '../src/lib/schema'
import { itemToRow, episodeToRow } from '../src/lib/rows'
import {
  setEpisodeWatched,
  setEpisodeWatchedAt,
  markWatchedUpTo,
  setSeasonWatched,
  orderedEpisodes,
  setStatus,
  setRating,
  updateItem,
  deleteItem,
  addBook,
  addManualBook,
  setBookProgress,
  bookPercent,
  addManga,
  addManualManga,
  setMangaProgress,
  mangaPercent,
  setReadUrl,
  statusLabel,
  countPreviousUnwatched,
  dropUnairedEpisodes,
  announcedSeasons,
  stopAskingMarkPrevious,
  epLabel,
} from '../src/lib/library'
import type { TmdbSeason } from '../src/lib/tmdb'
import {
  listFavourites,
  isFavourite,
  addFavourite,
  removeFavourite,
  toggleFavourite,
} from '../src/lib/people'
import type { Item, Episode } from '../src/types'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FALLO'} ${label}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}
function eq_<T>(label: string, actual: T, expected: T) {
  check(label, actual === expected, actual === expected ? '' : `esperado ${expected}, salió ${actual}`)
}

const tempFiles: string[] = []
let seq = 0
async function useFreshDb(): Promise<void> {
  const path = join(tmpdir(), `ludok-lib-${process.pid}-${seq++}.db`)
  rmSync(path, { force: true })
  tempFiles.push(path)
  const client = createClient({ url: `file:${path}` })
  await client.executeMultiple(CREATE_SQL)
  setDb(drizzle(client, { schema }) as unknown as LudokDb)
}
function cleanup() {
  for (const f of tempFiles) for (const s of ['', '-wal', '-shm']) rmSync(f + s, { force: true })
}

/** Crea una serie con N episodios sin marcar, sin pasar por TMDB. */
async function seedSeries(episodeCount = 5, seasons = 1): Promise<string> {
  const itemId = 'serie-test'
  const item: Item = {
    id: itemId,
    type: 'series',
    source: 'tmdb',
    sourceId: '999',
    title: 'Serie de prueba',
    status: 'plan',
    rating: 0,
    addedAt: 1700000000000,
  }
  await getDb().insert(itemsTable).values(itemToRow(item))
  const eps: Episode[] = []
  for (let s = 1; s <= seasons; s++) {
    for (let e = 1; e <= episodeCount; e++) {
      eps.push({
        id: `ep-s${s}e${e}`,
        itemId,
        season: s,
        episode: e,
        title: `S${s}E${e}`,
        watched: false,
      })
    }
  }
  await getDb().insert(episodesTable).values(eps.map(episodeToRow))
  return itemId
}

async function readItem(id: string): Promise<Item | undefined> {
  const rows = await getDb().select().from(itemsTable).where(eq(itemsTable.id, id)).limit(1)
  return rows[0] as unknown as Item | undefined
}
async function readEp(id: string) {
  const rows = await getDb().select().from(episodesTable).where(eq(episodesTable.id, id)).limit(1)
  return rows[0]
}

async function main() {
  console.log('\n=== 1. Marcar un episodio pone la serie en "viendo" ===')
  await useFreshDb()
  let itemId = await seedSeries(5)
  await setEpisodeWatched('ep-s1e1', true)
  let item = await readItem(itemId)
  eq_('estado pasa a watching', item?.status, 'watching')
  check('se guarda startedAt', !!item?.startedAt)
  check('todavía sin completedAt', !item?.completedAt)
  const ep1 = await readEp('ep-s1e1')
  eq_('el episodio queda visto', ep1?.watched, true)
  check('con fecha de visto', !!ep1?.watchedAt)

  console.log('\n=== 2. Desmarcar el último vuelve a "pendiente" ===')
  await setEpisodeWatched('ep-s1e1', false)
  item = await readItem(itemId)
  eq_('vuelve a plan', item?.status, 'plan')
  const ep1b = await readEp('ep-s1e1')
  eq_('sin marca', ep1b?.watched, false)
  eq_('y sin fecha', ep1b?.watchedAt, null)

  console.log('\n=== 3. Marcarlos todos completa la serie ===')
  for (let e = 1; e <= 5; e++) await setEpisodeWatched(`ep-s1e${e}`, true)
  item = await readItem(itemId)
  eq_('estado completed', item?.status, 'completed')
  check('con completedAt', !!item?.completedAt)
  const firstCompletedAt = item?.completedAt

  console.log('\n=== 4. LA REGLA CLAVE: no se pisa la fecha de completada ===')
  // Este es el fallo que ya se había arreglado en la web: desmarcar un episodio
  // por error y volver a marcarlo NO debe hacer parecer que la terminaste hoy.
  await new Promise((r) => setTimeout(r, 5))
  await setEpisodeWatched('ep-s1e3', false)
  await setEpisodeWatched('ep-s1e3', true)
  item = await readItem(itemId)
  eq_('completedAt intacta tras desmarcar y remarcar', item?.completedAt, firstCompletedAt)
  eq_('y sigue completada', item?.status, 'completed')

  console.log('\n=== 5. "hasta aquí" marca este y los anteriores ===')
  await useFreshDb()
  itemId = await seedSeries(5)
  await markWatchedUpTo(itemId, 'ep-s1e3')
  const eps = await orderedEpisodes(itemId)
  eq_('vistos 1..3', eps.filter((e) => e.watched).length, 3)
  check(
    'y son justo los tres primeros',
    eps.slice(0, 3).every((e) => e.watched) && eps.slice(3).every((e) => !e.watched),
  )
  item = await readItem(itemId)
  eq_('la serie queda viendo', item?.status, 'watching')

  console.log('\n=== 6. Marcar y desmarcar una temporada entera ===')
  await useFreshDb()
  itemId = await seedSeries(4, 2) // 2 temporadas de 4
  let all = await orderedEpisodes(itemId)
  const season1 = all.filter((e) => e.season === 1)
  await setSeasonWatched(itemId, season1, true)
  all = await orderedEpisodes(itemId)
  eq_('4 vistos de la T1', all.filter((e) => e.watched).length, 4)
  check('la T2 sigue sin tocar', all.filter((e) => e.season === 2).every((e) => !e.watched))
  await setSeasonWatched(itemId, season1, false)
  all = await orderedEpisodes(itemId)
  eq_('desmarcada entera', all.filter((e) => e.watched).length, 0)
  check('y sin fechas colgando', all.every((e) => !e.watchedAt))

  console.log('\n=== 7. Editar y borrar la fecha de visto a mano ===')
  await useFreshDb()
  itemId = await seedSeries(2)
  await setEpisodeWatched('ep-s1e1', true)
  await setEpisodeWatchedAt('ep-s1e1', 1234567890000)
  eq_('fecha puesta a mano', (await readEp('ep-s1e1'))?.watchedAt, 1234567890000)
  await setEpisodeWatchedAt('ep-s1e1', undefined)
  eq_('fecha borrada', (await readEp('ep-s1e1'))?.watchedAt, null)
  eq_('pero sigue contando como visto', (await readEp('ep-s1e1'))?.watched, true)

  console.log('\n=== 8. updateItem: undefined vacía el campo ===')
  await updateItem(itemId, { rating: 7 })
  eq_('nota guardada', (await readItem(itemId))?.rating, 7)
  await updateItem(itemId, { completedAt: 111 })
  eq_('completedAt puesta', (await readItem(itemId))?.completedAt, 111)
  await updateItem(itemId, { completedAt: undefined })
  eq_('completedAt vaciada con undefined', (await readItem(itemId))?.completedAt, null)
  await setRating(itemId, 10)
  eq_('setRating funciona', (await readItem(itemId))?.rating, 10)

  console.log('\n=== 9. setStatus respeta las fechas que ya había ===')
  await useFreshDb()
  const bookId = await addManualBook({ title: 'Berserk 1', author: 'Miura', pages: 224 })
  await updateItem(bookId, { completedAt: 555 })
  await setStatus(bookId, 'completed')
  eq_('no pisa una completedAt previa', (await readItem(bookId))?.completedAt, 555)
  await setStatus(bookId, 'watching')
  check('pone startedAt al empezar', !!(await readItem(bookId))?.startedAt)

  console.log('\n=== 10. Progreso de libros ===')
  await useFreshDb()
  const b = await addManualBook({ title: 'Un libro', pages: 200 })
  await setBookProgress(b, 0)
  eq_('página 0 → pendiente', (await readItem(b))?.status, 'plan')
  await setBookProgress(b, 100)
  eq_('a medias → leyendo', (await readItem(b))?.status, 'watching')
  eq_('página guardada', (await readItem(b))?.currentPage, 100)
  eq_('50%', bookPercent((await readItem(b)) as Item), 50)
  await setBookProgress(b, 500) // más que el total
  eq_('no pasa del total', (await readItem(b))?.currentPage, 200)
  eq_('y queda leído', (await readItem(b))?.status, 'completed')
  eq_('100%', bookPercent((await readItem(b)) as Item), 100)

  console.log('\n=== 11. No se duplican libros de la misma fuente ===')
  await useFreshDb()
  const book = {
    key: 'OL123W',
    source: 'openlibrary' as const,
    title: 'Dune',
    author: 'Herbert',
    pages: 600,
  }
  const id1 = await addBook(book)
  const id2 = await addBook(book)
  eq_('el mismo libro devuelve el mismo id', id1, id2)
  const count = (await getDb().select().from(itemsTable)).length
  eq_('solo una fila', count, 1)
  // Misma clave pero otra fuente: es otro libro distinto.
  const id3 = await addBook({ ...book, source: 'googlebooks' })
  check('otra fuente es otro libro', id3 !== id1)
  eq_('ahora dos filas', (await getDb().select().from(itemsTable)).length, 2)

  console.log('\n=== 12. Borrar arrastra los episodios ===')
  await useFreshDb()
  itemId = await seedSeries(5)
  const otroId = await addManualBook({ title: 'Un libro aparte' })
  eq_('5 episodios antes', (await getDb().select().from(episodesTable)).length, 5)
  await deleteItem(itemId)
  eq_('la serie desaparece', (await readItem(itemId)) ?? null, null)
  eq_('y sus episodios también', (await getDb().select().from(episodesTable)).length, 0)
  eq_('el otro título sigue ahí', (await getDb().select().from(itemsTable)).length, 1)
  check('y es el que debe ser', !!(await readItem(otroId)))

  console.log('\n=== 13. Ofrecer marcar los episodios anteriores ===')
  await useFreshDb()
  itemId = await seedSeries(10)
  let eps10 = await orderedEpisodes(itemId)
  eq_('marcando el 1º no hay anteriores', countPreviousUnwatched(eps10, 'ep-s1e1'), 0)
  eq_('marcando el 6º quedan 5 detrás', countPreviousUnwatched(eps10, 'ep-s1e6'), 5)
  // Con algunos ya vistos solo cuentan los que faltan de verdad.
  await setEpisodeWatched('ep-s1e1', true)
  await setEpisodeWatched('ep-s1e2', true)
  eps10 = await orderedEpisodes(itemId)
  eq_('ya vistos 2, quedan 3 detrás del 6º', countPreviousUnwatched(eps10, 'ep-s1e6'), 3)
  eq_('detrás del 3º solo queda 0', countPreviousUnwatched(eps10, 'ep-s1e3'), 0)
  check('un id que no existe no rompe', countPreviousUnwatched(eps10, 'nope') === 0)
  // Decir «sí» equivale a marcar hasta ahí.
  await markWatchedUpTo(itemId, 'ep-s1e6')
  eps10 = await orderedEpisodes(itemId)
  eq_('tras decir que sí, 6 vistos', eps10.filter((e) => e.watched).length, 6)

  console.log('\n=== 14. «No preguntar en esta serie» se recuerda ===')
  check('por defecto se pregunta', (await readItem(itemId))?.askMarkPrevious !== false)
  await stopAskingMarkPrevious(itemId)
  eq_('deja de preguntarse', (await readItem(itemId))?.askMarkPrevious, false)
  // Y es por serie, no global:
  const otra = await addManualBook({ title: 'Otro título' })
  check('otro título no queda afectado', (await readItem(otra))?.askMarkPrevious !== false)

  console.log('\n=== 15. Episodios sin emitir ===')
  // TMDB devuelve las temporadas completas, con los capítulos futuros dentro.
  // Guardarlos ensuciaba la lista y dejaba el progreso clavado en 24/25.
  await useFreshDb()
  itemId = await seedSeries(3)
  const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const lejos = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  await getDb()
    .update(episodesTable)
    .set({ airDate: ayer })
    .where(eq(episodesTable.id, 'ep-s1e1'))
  await getDb()
    .update(episodesTable)
    .set({ airDate: manana })
    .where(eq(episodesTable.id, 'ep-s1e2'))
  await getDb()
    .update(episodesTable)
    .set({ airDate: lejos })
    .where(eq(episodesTable.id, 'ep-s1e3'))

  eq_('quitados los 2 que no han salido', await dropUnairedEpisodes(itemId), 2)
  let quedan = await orderedEpisodes(itemId)
  eq_('queda solo el emitido', quedan.length, 1)
  eq_('y es el correcto', quedan[0]?.id, 'ep-s1e1')

  // Un episodio marcado como visto NO se toca aunque su fecha diga que no ha
  // salido: la marca del usuario manda sobre una fecha equivocada de TMDB.
  await useFreshDb()
  itemId = await seedSeries(2)
  await getDb().update(episodesTable).set({ airDate: manana }).where(eq(episodesTable.id, 'ep-s1e1'))
  await getDb().update(episodesTable).set({ airDate: manana }).where(eq(episodesTable.id, 'ep-s1e2'))
  await setEpisodeWatched('ep-s1e1', true)
  eq_('solo quita el que no está visto', await dropUnairedEpisodes(itemId), 1)
  quedan = await orderedEpisodes(itemId)
  eq_('el visto sobrevive', quedan.length, 1)
  eq_('y sigue marcado', quedan[0]?.watched, true)
  // Al quedarse sin pendientes, la serie pasa a completada.
  eq_('la serie queda completada', (await readItem(itemId))?.status, 'completed')

  // Sin fecha se da por emitido: series antiguas sin fecha en TMDB.
  await useFreshDb()
  itemId = await seedSeries(2)
  eq_('los que no tienen fecha no se tocan', await dropUnairedEpisodes(itemId), 0)
  eq_('siguen los 2', (await orderedEpisodes(itemId)).length, 2)

  console.log('\n=== 16. Manga: progreso por capítulos ===')
  await useFreshDb()
  const mangaId = await addManualManga({ title: 'Berserk', author: 'Miura', chapters: 364 })
  eq_('empieza pendiente', (await readItem(mangaId))?.status, 'plan')
  eq_('y por el capítulo 0', (await readItem(mangaId))?.currentChapter, 0)

  await setMangaProgress(mangaId, 145)
  eq_('a medias → leyendo', (await readItem(mangaId))?.status, 'watching')
  eq_('capítulo guardado', (await readItem(mangaId))?.currentChapter, 145)
  eq_('40%', mangaPercent((await readItem(mangaId)) as Item), 40)

  await setMangaProgress(mangaId, 999) // más que el total
  eq_('no pasa del total', (await readItem(mangaId))?.currentChapter, 364)
  eq_('y queda terminado', (await readItem(mangaId))?.status, 'completed')
  eq_('100%', mangaPercent((await readItem(mangaId)) as Item), 100)

  await setMangaProgress(mangaId, 0)
  eq_('volver a 0 lo deja pendiente', (await readItem(mangaId))?.status, 'plan')

  // Los capítulos NO se guardan en el campo de páginas de los libros: son
  // conceptos distintos y mezclarlos haría que el modelo mintiera.
  eq_('no toca currentPage', (await readItem(mangaId))?.currentPage, null)

  console.log('\n=== 17. Manga sin saber cuántos capítulos tiene ===')
  await useFreshDb()
  const abierto = await addManualManga({ title: 'Algo en curso' })
  await setMangaProgress(abierto, 50)
  eq_('avanza igual', (await readItem(abierto))?.currentChapter, 50)
  eq_('se queda leyendo, no terminado', (await readItem(abierto))?.status, 'watching')
  eq_('sin total, 0%', mangaPercent((await readItem(abierto)) as Item), 0)

  console.log('\n=== 18. Enlace de lectura ===')
  eq_('arranca sin enlace', (await readItem(abierto))?.readUrl, null)
  await setReadUrl(abierto, 'https://inmanga.com/ver/manga/Algo/abc')
  eq_('se guarda', (await readItem(abierto))?.readUrl, 'https://inmanga.com/ver/manga/Algo/abc')
  await setReadUrl(abierto, undefined)
  eq_('y se puede quitar', (await readItem(abierto))?.readUrl, null)

  console.log('\n=== 19. No se duplica un manga de MangaDex ===')
  await useFreshDb()
  const md = { key: 'md-1', title: 'Berserk', author: 'Miura', lastChapter: 364 }
  const a1 = await addManga(md)
  const a2 = await addManga(md)
  eq_('el mismo manga devuelve el mismo id', a1, a2)
  eq_('solo una fila', (await getDb().select().from(itemsTable)).length, 1)

  console.log('\n=== 20. Actores favoritos ===')
  await useFreshDb()
  const gillian = { tmdbId: 12214, name: 'Gillian Anderson', photo: 'https://x/g.jpg' }
  const emma = { tmdbId: 2201315, name: 'Emma Mackey' }

  check('al principio no hay ninguno', (await listFavourites()).length === 0)
  check('y no es favorito', !(await isFavourite(gillian.tmdbId)))

  await addFavourite(gillian)
  check('tras marcarlo, sí lo es', await isFavourite(gillian.tmdbId))
  eq_('y hay uno', (await listFavourites()).length, 1)

  // El mismo actor dos veces no se duplica: el índice va por su id de TMDB.
  const primera = await addFavourite(gillian)
  const segunda = await addFavourite(gillian)
  eq_('marcarlo dos veces devuelve el mismo', primera, segunda)
  eq_('y sigue habiendo uno', (await listFavourites()).length, 1)

  await addFavourite(emma)
  eq_('dos favoritos', (await listFavourites()).length, 2)
  // El último marcado va primero.
  eq_('el último marcado, arriba', (await listFavourites())[0]?.name, 'Emma Mackey')
  // Sin foto se guarda vacío, no como texto vacío.
  eq_('sin foto queda a null', (await listFavourites())[0]?.photo, undefined)

  eq_('desmarcar devuelve false', await toggleFavourite(gillian), false)
  check('y deja de serlo', !(await isFavourite(gillian.tmdbId)))
  eq_('queda el otro', (await listFavourites()).length, 1)
  eq_('marcar de nuevo devuelve true', await toggleFavourite(gillian), true)
  eq_('y vuelven a ser dos', (await listFavourites()).length, 2)

  await removeFavourite(emma.tmdbId)
  eq_('quitar uno deja el otro', (await listFavourites()).length, 1)
  check('quitar uno que no está no rompe', ((await removeFavourite(999999)), true))

  console.log('\n=== 21. Temporadas anunciadas de verdad ===')
  // Bug real: "Nadie quiere esto" muestra una T3 en TMDB con 10 episodios
  // "plantilla" (Episodio 1, Episodio 2…), sin foto y sin fecha — la temporada
  // se renovó pero no hay nada grabado todavía. La señal fiable es la fecha DE
  // LA TEMPORADA, no la de cada episodio.
  const temporadaSeason = (n: number, airDate?: string): TmdbSeason => ({
    seasonNumber: n,
    episodeCount: 10,
    name: `Temporada ${n}`,
    airDate,
  })
  const nadieQuiereEsto = [
    temporadaSeason(1, '2024-09-26'),
    temporadaSeason(2, '2025-10-23'),
    temporadaSeason(3, undefined), // la "plantilla": TMDB no le ha puesto fecha
  ]
  const anunciadas = announcedSeasons(nadieQuiereEsto)
  eq_('de las 3 temporadas, solo 2 están anunciadas', anunciadas.length, 2)
  check('la 1 y la 2 pasan', anunciadas.some((s) => s.seasonNumber === 1) && anunciadas.some((s) => s.seasonNumber === 2))
  check('la 3 (sin fecha) se queda fuera', !anunciadas.some((s) => s.seasonNumber === 3))

  // Wednesday T3: mismo caso, pero con 0 episodios en vez de 10 de relleno —
  // el filtro tiene que dar igual, porque mira la fecha, no cuántos episodios trae.
  const wednesday = [
    temporadaSeason(1, '2022-11-23'),
    temporadaSeason(2, '2025-08-06'),
    { seasonNumber: 3, episodeCount: 0, name: 'Temporada 3', airDate: undefined },
  ]
  eq_('da igual que la plantilla traiga 0 episodios', announcedSeasons(wednesday).length, 2)

  // The Bear T5: fecha futura pero YA decidida — eso no es una plantilla, es
  // una temporada real con estreno programado. Cuenta como anunciada; que sus
  // episodios individuales aún no hayan salido ya lo filtra `hasAired` aparte.
  const theBear = [temporadaSeason(4, '2025-06-25'), temporadaSeason(5, '2026-06-25')]
  eq_('una fecha futura pero real SÍ cuenta como anunciada', announcedSeasons(theBear).length, 2)

  console.log('\n=== 22. Textos (libros y manga se leen, no se ven) ===')
  eq_('libro leyendo', statusLabel('watching', 'book'), 'Leyendo')
  eq_('manga leyendo', statusLabel('watching', 'manga'), 'Leyendo')
  eq_('manga leído', statusLabel('completed', 'manga'), 'Leído')
  eq_('libro leído', statusLabel('completed', 'book'), 'Leído')
  eq_('serie viendo', statusLabel('watching', 'series'), 'Viendo')
  eq_('serie completada', statusLabel('completed'), 'Completado')
  eq_('etiqueta de episodio', epLabel({ season: 2, episode: 5, title: 'Hola' } as Episode), 'S2E5 · Hola')
  eq_('sin título', epLabel({ season: 2, episode: 5 } as Episode), 'S2E5')

  console.log(
    failures === 0
      ? '\n✅ TODO CORRECTO — las reglas se comportan igual que en la web\n'
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
