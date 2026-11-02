/**
 * Misma lógica de negocio que la versión web: lo único que cambia es cómo se
 * habla con la base de datos (Drizzle/SQLite en vez de Dexie/IndexedDB).
 *
 * Un detalle que mejora por el camino: en Dexie los campos `source` y
 * `sourceId` no estaban indexados, así que para buscar duplicados había que
 * traerse TODO y filtrar en JavaScript. Aquí son columnas de verdad y se
 * filtran en la propia consulta.
 *
 * Era un solo fichero de casi 900 líneas; se partió por temas y este índice
 * reexporta lo público para que el resto de la app siga importando de
 * `lib/library` sin enterarse. `queries.ts` se reexporta a mano y no entero:
 * sus helpers son internos (ver el comentario de ese fichero).
 */
export { hasEpisode, updateItem } from './queries'
export * from './tmdbSync'
export * from './episodes'
export * from './rewatch'
export * from './status'
export * from './books'
