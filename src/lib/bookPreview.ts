import type { BookResult } from './openlibrary'

/**
 * Almacén en memoria del libro que se está previsualizando.
 *
 * Open Library y Google Books no ofrecen un endpoint de detalle tan rico como
 * TMDB, así que la vista previa reutiliza los datos que ya trajo la búsqueda. En
 * la web viajaban en el `state` del router; aquí no pueden ir en la URL porque
 * las claves de Open Library son del tipo `/works/OL123W` y una barra dentro de
 * un segmento de ruta da problemas aunque vaya codificada.
 *
 * Es un handoff deliberadamente simple: si la app se reinicia se pierde, y la
 * pantalla ya sabe pedir que vuelvas a buscar.
 */
let pending: BookResult | null = null

export function setBookPreview(book: BookResult): void {
  pending = book
}

/** El libro que se estaba previsualizando, si lo hay. */
export function getBookPreview(): BookResult | null {
  return pending
}
