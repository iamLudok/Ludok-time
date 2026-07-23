// Cliente de Google Books. No necesita API key para búsquedas ligeras y
// tiene mejor cobertura que Open Library para manga y libros más raros.
import type { BookResult } from './openlibrary'

const SEARCH = 'https://www.googleapis.com/books/v1/volumes'

interface RawVolume {
  id: string
  volumeInfo?: {
    title?: string
    authors?: string[]
    publishedDate?: string
    pageCount?: number
    imageLinks?: { thumbnail?: string; smallThumbnail?: string }
  }
}

function yearFrom(date?: string): number | undefined {
  if (!date) return undefined
  const y = parseInt(date.slice(0, 4), 10)
  return Number.isFinite(y) ? y : undefined
}

export async function searchGoogleBooks(query: string): Promise<BookResult[]> {
  if (!query.trim()) return []
  const url = new URL(SEARCH)
  url.searchParams.set('q', query)
  url.searchParams.set('maxResults', '20')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Error de Google Books (${res.status}).`)
  const data = (await res.json()) as { items?: RawVolume[] }

  return (data.items ?? [])
    .filter((v) => v.volumeInfo?.title)
    .map((v) => {
      const info = v.volumeInfo!
      // Las miniaturas de Google Books a veces vienen en http://: forzamos
      // https para no romper la página (servida por HTTPS) con mixed content.
      const cover = info.imageLinks?.thumbnail?.replace(/^http:/, 'https:')
      return {
        key: v.id,
        source: 'googlebooks' as const,
        title: info.title!,
        author: info.authors?.[0],
        year: yearFrom(info.publishedDate),
        cover,
        pages: info.pageCount,
      }
    })
}
