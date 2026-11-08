// TMDB no da un enlace directo a "este título en Netflix" en su API gratuita
// (solo un enlace genérico a una página de TMDB). En su lugar, abrimos una
// búsqueda de ese título dentro de cada plataforma conocida: un paso menos
// que abrir la app/web y buscar a mano, aunque no sea un enlace exacto.

const SEARCH_URL_BY_PROVIDER: Record<string, (title: string) => string> = {
  Netflix: (t) => `https://www.netflix.com/search?q=${encodeURIComponent(t)}`,
  'Amazon Prime Video': (t) =>
    `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${encodeURIComponent(t)}`,
  'Disney Plus': (t) => `https://www.disneyplus.com/search?q=${encodeURIComponent(t)}`,
  'HBO Max': (t) => `https://play.max.com/search?q=${encodeURIComponent(t)}`,
  Max: (t) => `https://play.max.com/search?q=${encodeURIComponent(t)}`,
  'Movistar Plus+': (t) => `https://ver.movistarplus.es/buscador/?q=${encodeURIComponent(t)}`,
  Filmin: (t) => `https://www.filmin.es/busqueda?q=${encodeURIComponent(t)}`,
  'Apple TV': (t) => `https://tv.apple.com/search?term=${encodeURIComponent(t)}`,
  'Apple TV Plus': (t) => `https://tv.apple.com/search?term=${encodeURIComponent(t)}`,
  'Google Play Movies': (t) =>
    `https://play.google.com/store/search?q=${encodeURIComponent(t)}&c=movies`,
  'Rakuten TV': (t) => `https://www.rakuten.tv/es/search?q=${encodeURIComponent(t)}`,
  SkyShowtime: (t) => `https://www.skyshowtime.com/search?q=${encodeURIComponent(t)}`,
}

/**
 * URL de búsqueda de `title` en la plataforma `providerName` (tal y como la
 * nombra TMDB), o null si no reconocemos esa plataforma. Coincidencia
 * flexible: TMDB a veces varía ligeramente el nombre exacto.
 */
export function providerSearchUrl(providerName: string, title: string): string | null {
  const name = providerName.toLowerCase()
  const key = Object.keys(SEARCH_URL_BY_PROVIDER).find(
    (k) => name.includes(k.toLowerCase()) || k.toLowerCase().includes(name),
  )
  return key ? SEARCH_URL_BY_PROVIDER[key](title) : null
}

/**
 * Nombre base de una plataforma, sin la variante de "con anuncios" (TMDB
 * lista "Netflix" y "Netflix Standard with Ads" como proveedores distintos,
 * aunque para nosotros son el mismo logo/enlace). Se usa solo para agrupar,
 * no para mostrar.
 */
export function baseProviderName(providerName: string): string {
  return providerName
    .replace(/\s*(standard|basic|premium)?\s*with ads.*$/i, '')
    .trim()
    .toLowerCase()
}
