// Cliente de MangaDex para buscar manga. Gratis y sin API key.
//
// Se eligió frente a Google Books porque para manga la diferencia es enorme:
// devuelve estado (en curso/terminado), demografía, descripción en español y
// portada, mientras que Google Books trata cada tomo como un libro suelto.

const API = 'https://api.mangadex.org'
const COVERS = 'https://uploads.mangadex.org/covers'

export interface MangaResult {
  /** id de MangaDex. */
  key: string
  title: string
  author?: string
  year?: number
  cover?: string
  description?: string
  /** 'ongoing' | 'completed' | 'hiatus' | 'cancelled' */
  status?: string
  /** Último capítulo publicado, si MangaDex lo sabe. */
  lastChapter?: number
}

interface RawManga {
  id: string
  attributes?: {
    title?: Record<string, string>
    altTitles?: Array<Record<string, string>>
    description?: Record<string, string>
    year?: number | null
    status?: string
    lastChapter?: string | null
  }
  relationships?: Array<{
    type: string
    attributes?: { fileName?: string; name?: string }
  }>
}

/**
 * Elige el mejor texto de un campo multiidioma.
 *
 * MangaDex devuelve títulos y descripciones como un mapa de idioma a texto, y
 * NO garantiza que exista el inglés: hay obras que solo traen japonés romanizado.
 * Sin este orden de preferencia, algunos manga salían sin título.
 */
function pick(map: Record<string, string> | undefined, prefer: string[]): string | undefined {
  if (!map) return undefined
  for (const lang of prefer) {
    if (map[lang]) return map[lang]
  }
  return Object.values(map)[0]
}

const TITLE_LANGS = ['es', 'es-la', 'en', 'ja-ro', 'ja']
const TEXT_LANGS = ['es', 'es-la', 'en']

export function statusLabel(status: string | undefined): string {
  const map: Record<string, string> = {
    ongoing: 'En curso',
    completed: 'Terminado',
    hiatus: 'En pausa',
    cancelled: 'Cancelado',
  }
  return status ? (map[status] ?? status) : ''
}

export async function searchManga(query: string): Promise<MangaResult[]> {
  if (!query.trim()) return []

  const url = new URL(`${API}/manga`)
  url.searchParams.set('title', query)
  url.searchParams.set('limit', '20')
  // Sin ordenar por relevancia, buscar «berserk» devolvía primero obras que
  // solo llevan esa palabra dentro del título.
  url.searchParams.set('order[relevance]', 'desc')
  // La portada llega en la misma petición en vez de una por manga.
  url.searchParams.append('includes[]', 'cover_art')
  url.searchParams.append('includes[]', 'author')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Error de MangaDex (${res.status}).`)
  const data = (await res.json()) as { data?: RawManga[] }

  return (data.data ?? []).map((m) => {
    const a = m.attributes ?? {}
    const cover = m.relationships?.find((r) => r.type === 'cover_art')?.attributes?.fileName
    const author = m.relationships?.find((r) => r.type === 'author')?.attributes?.name
    const last = a.lastChapter ? Number(a.lastChapter) : undefined

    return {
      key: m.id,
      title: pick(a.title, TITLE_LANGS) ?? '(sin título)',
      author,
      year: a.year ?? undefined,
      // El sufijo .256.jpg pide la miniatura en vez de la portada a tamaño
      // completo, que puede pesar varios megas.
      cover: cover ? `${COVERS}/${m.id}/${cover}.256.jpg` : undefined,
      description: pick(a.description, TEXT_LANGS),
      status: a.status,
      lastChapter: Number.isFinite(last) ? last : undefined,
    }
  })
}
