// Resuelve el enlace directo a un manga en inManga, para el botón de «Leer».
//
// Su buscador NO funciona por parámetros de URL: `?suggestion=` devuelve la
// página pero sin filtrar nada. La búsqueda de verdad es una petición POST que
// devuelve un trozo de HTML con los resultados. Aquí solo se saca de ahí la
// dirección del manga — ni se descarga ni se muestra contenido suyo.
//
// ⚠️ Esto depende de cómo tengan hecha su web. El día que la cambien dejará de
// encontrar el enlace: por eso NUNCA lanza error, devuelve null y la ficha
// permite pegarlo a mano.

const BASE = 'https://inmanga.com'
const SEARCH = `${BASE}/manga/getMangasConsultResult`

/** El buscador espera los filtros en este formato, con nombres suyos. */
function searchBody(query: string): string {
  const params = new URLSearchParams()
  params.append('filter[generes][]', '-1')
  params.append('filter[queryString]', query)
  params.append('filter[skip]', '0')
  params.append('filter[take]', '5')
  params.append('filter[sortby]', '1')
  params.append('filter[broadcastStatus]', '0')
  params.append('filter[onlyFavorites]', 'false')
  params.append('d', '')
  return params.toString()
}

/**
 * Busca un manga por título y devuelve su dirección en inManga, o null si no lo
 * encuentra (o si su web ha cambiado y ya no se reconoce la respuesta).
 */
export async function findReadUrl(title: string): Promise<string | null> {
  if (!title.trim()) return null
  try {
    const res = await fetch(SEARCH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: searchBody(title),
    })
    if (!res.ok) return null

    const html = await res.text()
    // Los resultados son enlaces del tipo /ver/manga/<nombre>/<identificador>.
    const match = html.match(/\/ver\/manga\/[^"'\s]+/)
    return match ? BASE + match[0] : null
  } catch {
    return null
  }
}

/** Buscador de inManga, para cuando no se encuentra el enlace y toca mirarlo a mano. */
export const SEARCH_PAGE = `${BASE}/manga/consult`
