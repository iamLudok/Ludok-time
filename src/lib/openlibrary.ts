// Cliente de Open Library (openlibrary.org) para buscar libros.
// No necesita API key y permite CORS desde el navegador.

const SEARCH = 'https://openlibrary.org/search.json'
const COVERS = 'https://covers.openlibrary.org/b/id'

export interface BookResult {
  /** clave de la obra: id de Open Library o de Google Books, según `source`. */
  key: string
  source: 'openlibrary' | 'googlebooks'
  title: string
  author?: string
  year?: number
  cover?: string
  pages?: number
}

/** URL de portada a partir del id de portada de Open Library. */
export function coverUrl(coverId?: number, size: 'S' | 'M' | 'L' = 'M'): string {
  return coverId ? `${COVERS}/${coverId}-${size}.jpg` : ''
}

interface RawDoc {
  key: string
  title: string
  author_name?: string[]
  first_publish_year?: number
  cover_i?: number
  number_of_pages_median?: number
}

export async function searchBooks(query: string): Promise<BookResult[]> {
  if (!query.trim()) return []
  const url = new URL(SEARCH)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '20')
  // Pedimos solo los campos que usamos: la respuesta completa es enorme.
  url.searchParams.set(
    'fields',
    'key,title,author_name,first_publish_year,cover_i,number_of_pages_median',
  )

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Error de Open Library (${res.status}).`)
  const data = (await res.json()) as { docs?: RawDoc[] }

  return (data.docs ?? []).map((d) => ({
    key: d.key,
    source: 'openlibrary' as const,
    title: d.title,
    author: d.author_name?.[0],
    year: d.first_publish_year,
    cover: coverUrl(d.cover_i),
    pages: d.number_of_pages_median,
  }))
}
