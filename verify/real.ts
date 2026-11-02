/**
 * Verificación con una copia REAL: `tsx verify/real.ts <ruta-al-json>`
 *
 * Importa el fichero con el código de verdad, vuelve a exportarlo y compara
 * campo a campo. Informa de cualquier campo que se pierda por el camino, en vez
 * de dejar que desaparezca en silencio. No modifica el fichero de entrada.
 */
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync, readFileSync } from 'node:fs'
import * as schema from '../src/lib/schema'
import { CREATE_SQL } from '../src/lib/schemaSql'
import { exportAll, importBackup, readSettings, type LudokDb } from '../src/lib/backupCore'
import type { BackupFile } from '../src/types'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FALLO'} ${label}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}
function eq<T>(label: string, actual: T, expected: T) {
  check(label, actual === expected, actual === expected ? '' : `esperado ${expected}, salió ${actual}`)
}

const path = process.argv[2]
if (!path) {
  console.error('Uso: tsx verify/real.ts <ruta-al-json>')
  process.exit(1)
}

const tmp = join(tmpdir(), `ludok-real-${process.pid}.db`)
function cleanup() {
  for (const s of ['', '-wal', '-shm']) rmSync(tmp + s, { force: true })
}

/** Campos que la app nueva ya no tiene, porque se quitaron a propósito. */
const INTENTIONALLY_DROPPED = new Set(['notes', 'tags'])

async function main() {
  const raw = readFileSync(path, 'utf8')
  const original = JSON.parse(raw) as BackupFile

  console.log(`\n=== Copia de origen: ${path} ===`)
  console.log(`  exportada el ${new Date(original.exportedAt).toLocaleString('es-ES')}`)
  console.log(`  ${original.items.length} títulos · ${original.episodes.length} episodios`)

  rmSync(tmp, { force: true })
  const client = createClient({ url: `file:${tmp}` })
  await client.executeMultiple(CREATE_SQL)
  const db = drizzle(client, { schema }) as unknown as LudokDb

  console.log('\n=== 1. Importar ===')
  const res = await importBackup(db, raw, 'replace')
  eq('títulos importados', res.items, original.items.length)
  eq('episodios importados', res.episodes, original.episodes.length)

  console.log('\n=== 2. Volver a exportar y cuadrar cuentas ===')
  const back = await exportAll(db)
  eq('nº de títulos', back.items.length, original.items.length)
  eq('nº de episodios', back.episodes.length, original.episodes.length)
  eq(
    'episodios vistos',
    back.episodes.filter((e) => e.watched).length,
    original.episodes.filter((e) => e.watched).length,
  )
  eq(
    'episodios con fecha de visto',
    back.episodes.filter((e) => e.watchedAt).length,
    original.episodes.filter((e) => e.watchedAt).length,
  )
  eq(
    'episodios con fotograma',
    back.episodes.filter((e) => e.still).length,
    original.episodes.filter((e) => e.still).length,
  )
  eq(
    'títulos con nota',
    back.items.filter((i) => i.rating > 0).length,
    original.items.filter((i) => i.rating > 0).length,
  )
  // La key se restaura en la base, pero ya no vuelve a salir en la copia.
  eq('API key de TMDB restaurada', (await readSettings(db)).tmdbApiKey, original.settings?.tmdbApiKey || '')
  eq('y no sale en la copia nueva', back.settings?.tmdbApiKey ?? '', '')
  eq('tema', back.settings?.theme, original.settings?.theme)

  console.log('\n=== 3. Por tipo y estado ===')
  for (const type of [...new Set(original.items.map((i) => i.type))]) {
    eq(
      `títulos de tipo ${type}`,
      back.items.filter((i) => i.type === type).length,
      original.items.filter((i) => i.type === type).length,
    )
  }
  for (const status of [...new Set(original.items.map((i) => i.status))]) {
    eq(
      `títulos en estado ${status}`,
      back.items.filter((i) => i.status === status).length,
      original.items.filter((i) => i.status === status).length,
    )
  }

  console.log('\n=== 4. Campo a campo, título a título ===')
  const dropped = new Map<string, string[]>()
  for (const orig of original.items) {
    const now = back.items.find((i) => i.id === orig.id)
    if (!now) {
      check(`"${orig.title}" presente`, false)
      continue
    }
    const problems: string[] = []
    for (const [key, value] of Object.entries(orig)) {
      if (value === undefined || value === null) continue
      if (Array.isArray(value) && value.length === 0) continue
      if (typeof value === 'string' && value === '') continue
      if (INTENTIONALLY_DROPPED.has(key)) {
        const list = dropped.get(key) ?? []
        list.push(`${orig.title}: ${JSON.stringify(value)}`)
        dropped.set(key, list)
        continue
      }
      const after = (now as unknown as Record<string, unknown>)[key]
      if (JSON.stringify(after) !== JSON.stringify(value)) {
        problems.push(`${key}: ${JSON.stringify(value)} → ${JSON.stringify(after)}`)
      }
    }
    check(`"${orig.title}" intacto`, problems.length === 0, problems.join('; '))
  }

  console.log('\n=== 5. Campo a campo, los 1.423 episodios ===')
  const epProblems: string[] = []
  for (const orig of original.episodes) {
    const now = back.episodes.find((e) => e.id === orig.id)
    if (!now) {
      epProblems.push(`falta ${orig.id}`)
      continue
    }
    for (const [key, value] of Object.entries(orig)) {
      if (value === undefined || value === null) continue
      if (typeof value === 'string' && value === '') continue
      if (INTENTIONALLY_DROPPED.has(key)) continue
      const after = (now as unknown as Record<string, unknown>)[key]
      if (JSON.stringify(after) !== JSON.stringify(value)) {
        epProblems.push(`${orig.id} ${key}: ${JSON.stringify(value)} → ${JSON.stringify(after)}`)
      }
    }
  }
  check(
    `los ${original.episodes.length} episodios intactos`,
    epProblems.length === 0,
    epProblems.slice(0, 5).join('; ') + (epProblems.length > 5 ? ` … y ${epProblems.length - 5} más` : ''),
  )

  if (dropped.size) {
    console.log('\n=== Campos descartados a propósito (quitados de la app) ===')
    for (const [key, list] of dropped) {
      console.log(`  ${key}:`)
      for (const l of list) console.log(`    · ${l}`)
    }
  }

  console.log(
    failures === 0
      ? '\n✅ TUS DATOS PASAN ÍNTEGROS a la app nueva\n'
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
