// Utilidades de YouTube sin API key ni servicios de terceros:
// - el id del vídeo se saca de la propia URL
// - la miniatura se sirve como imagen normal (img.youtube.com)
// - el título y el canal se piden al oEmbed oficial de YouTube (permite CORS)

const OEMBED = 'https://www.youtube.com/oembed'

/** Extrae el id de vídeo de cualquier formato de enlace de YouTube. */
export function videoIdFromUrl(input: string): string | null {
  const text = input.trim()
  if (!text) return null

  // Si ya nos pasan un id suelto (11 caracteres del alfabeto de YouTube).
  if (/^[\w-]{11}$/.test(text)) return text

  try {
    const url = new URL(text.startsWith('http') ? text : `https://${text}`)
    const host = url.hostname.replace(/^www\.|^m\./, '')

    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0]
      return /^[\w-]{11}$/.test(id) ? id : null
    }
    if (host.endsWith('youtube.com')) {
      const v = url.searchParams.get('v')
      if (v && /^[\w-]{11}$/.test(v)) return v
      // /shorts/ID, /embed/ID, /live/ID, /v/ID
      const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/)
      if (m) return m[1]
    }
  } catch {
    /* URL inválida */
  }
  return null
}

/** Miniatura del vídeo. Es una imagen pública: no hay problema de CORS. */
export function thumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

export interface VideoInfo {
  title: string
  channel?: string
}

/**
 * Pide título y canal al oEmbed oficial. Si falla (vídeo privado, borrado o sin
 * conexión) devolvemos null y quien llame decidirá (p.ej. pedir el título a mano).
 */
export async function fetchVideoInfo(videoId: string): Promise<VideoInfo | null> {
  try {
    const url = `${OEMBED}?url=${encodeURIComponent(watchUrl(videoId))}&format=json`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as { title?: string; author_name?: string }
    if (!data.title) return null
    return { title: data.title, channel: data.author_name }
  } catch {
    return null
  }
}

export interface TakeoutEntry {
  videoId: string
  title: string
  channel?: string
  watchedAt: number
}

/** Quita el prefijo que añade Takeout ("Has visto ", "Watched "…). */
function cleanTitle(raw: string): string {
  return raw.replace(/^(Has visto|Ha visto|Watched|Viste)\s+/i, '').trim()
}

/**
 * Interpreta el `watch-history.json` de Google Takeout.
 * Descarta anuncios, vídeos eliminados y entradas sin enlace válido.
 */
export function parseTakeout(json: string): TakeoutEntry[] {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('El fichero no es un JSON válido.')
  }
  if (!Array.isArray(raw)) {
    throw new Error('Esto no parece el historial de YouTube de Google Takeout.')
  }

  const entries: TakeoutEntry[] = []
  const seen = new Set<string>()

  for (const item of raw as Array<Record<string, unknown>>) {
    // Los anuncios traen un bloque "details" indicándolo.
    const details = item.details as Array<{ name?: string }> | undefined
    if (details?.some((d) => /ads?/i.test(d.name ?? ''))) continue

    const titleUrl = typeof item.titleUrl === 'string' ? item.titleUrl : ''
    const videoId = titleUrl ? videoIdFromUrl(titleUrl) : null
    if (!videoId) continue // vídeo eliminado o entrada sin enlace

    // Nos quedamos con la reproducción más reciente de cada vídeo.
    if (seen.has(videoId)) continue
    seen.add(videoId)

    const title = cleanTitle(typeof item.title === 'string' ? item.title : '')
    if (!title) continue

    const subtitles = item.subtitles as Array<{ name?: string }> | undefined
    const time = typeof item.time === 'string' ? Date.parse(item.time) : NaN

    entries.push({
      videoId,
      title,
      channel: subtitles?.[0]?.name,
      watchedAt: Number.isFinite(time) ? time : Date.now(),
    })
  }

  return entries
}
