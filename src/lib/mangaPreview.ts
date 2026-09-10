import type { MangaResult } from './mangadex'

/**
 * Manga que se está previsualizando, en memoria.
 *
 * Mismo apaño que con los libros: MangaDex no tiene un endpoint de detalle que
 * añada nada a lo que ya trajo la búsqueda, y meter el objeto entero en la URL
 * sería frágil. Si la app se reinicia se pierde, y la pantalla ya sabe pedir que
 * vuelvas a buscar.
 */
let pending: MangaResult | null = null

export function setMangaPreview(manga: MangaResult): void {
  pending = manga
}

export function getMangaPreview(): MangaResult | null {
  return pending
}