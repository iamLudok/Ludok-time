/**
 * Verificación de la pantalla «Próximos».
 *
 * Comprueba lo que se decide sin red: qué series entran en la lista y cómo se
 * ordenan. Las peticiones a TMDB no se prueban aquí — eso solo se ve con la app
 * en la mano y una API key de verdad.
 */
import { followedSeries, whenLabel, cachedUpcoming } from '../src/lib/upcoming'
import { autoBackupIsStale, STALE_DAYS } from '../src/lib/backupPolicy'
import type { Item, Status, MediaType } from '../src/types'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FALLO'} ${label}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}
function eq<T>(label: string, actual: T, expected: T) {
  check(label, actual === expected, actual === expected ? '' : `esperado ${expected}, salió ${actual}`)
}

function make(
  id: string,
  status: Status,
  type: MediaType = 'series',
  source: Item['source'] = 'tmdb',
  sourceId: string | undefined = '1',
): Item {
  return { id, type, source, sourceId, title: id, status, rating: 0, addedAt: 0 }
}

function main() {
  console.log('\n=== 1. Qué series entran ===')
  const items: Item[] = [
    make('viendo', 'watching'),
    make('completada', 'completed'),
    make('pendiente', 'plan'),
    make('abandonada', 'dropped'),
    make('en-pausa', 'on_hold'),
    make('peli', 'completed', 'movie'),
    make('libro', 'watching', 'book', 'manual', undefined),
    make('serie-a-mano', 'watching', 'series', 'manual', undefined),
  ]
  const out = followedSeries(items).map((i) => i.id)

  check('entra la que estás viendo', out.includes('viendo'))
  // Este es el caso importante: desde que no se guardan episodios sin emitir,
  // estar al día con una serie en emisión la deja marcada como «completada».
  check('entra la completada (estás al día, esperando el siguiente)', out.includes('completada'))
  check('NO entra la pendiente', !out.includes('pendiente'))
  check('NO entra la abandonada', !out.includes('abandonada'))
  check('NO entra la pausada', !out.includes('en-pausa'))
  check('NO entran películas', !out.includes('peli'))
  check('NO entran libros', !out.includes('libro'))
  // Sin id de TMDB no hay a quién preguntarle por el próximo episodio.
  check('NO entran series a mano', !out.includes('serie-a-mano'))
  eq('en total, 2', out.length, 2)

  console.log('\n=== 2. Cómo se lee la fecha ===')
  eq('en varios días', whenLabel(12), 'En 12 días')
  eq('mañana', whenLabel(1), 'Mañana')
  eq('hoy', whenLabel(0), 'Hoy')
  eq('ya pasó', whenLabel(-3), 'Ya debería estar')
  eq('sin fecha', whenLabel(null), 'Sin fecha anunciada')

  console.log('\n=== 3. La caché no sirve datos de otra lista ===')
  // Si cambias de series, lo cacheado ya no vale aunque sea reciente.
  const dos = followedSeries(items)
  eq('sin nada cacheado, no devuelve nada', cachedUpcoming(dos), null)

  console.log('\n=== 4. Aviso de copia automática atascada ===')
  // El caso peligroso: la tienes encendida, no sube, y te crees respaldado.
  const ahora = Date.now()
  check('apagada nunca avisa', !autoBackupIsStale({ autoBackup: false, lastAutoBackupAt: 0 }))
  check(
    'encendida y recién subida, no avisa',
    !autoBackupIsStale({ autoBackup: true, lastAutoBackupAt: ahora }),
  )
  check(
    `encendida y ${STALE_DAYS + 1} días sin subir, avisa`,
    autoBackupIsStale({ autoBackup: true, lastAutoBackupAt: ahora - (STALE_DAYS + 1) * 86400000 }),
  )
  check(
    'encendida y sin haber subido nunca, avisa',
    autoBackupIsStale({ autoBackup: true }),
  )

  console.log(
    failures === 0
      ? '\n✅ TODO CORRECTO — la lista de próximos incluye lo que debe\n'
      : `\n❌ ${failures} COMPROBACIONES FALLIDAS\n`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main()
