import { useEffect, useState } from 'react'
import { getSeries, type TmdbNextEpisode } from '../lib/tmdb'
import { syncSeriesEpisodes } from '../lib/library'
import { toast } from '../lib/toast'
import type { Episode } from '../types'

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00').getTime()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target - today.getTime()) / 86_400_000)
}

/**
 * Cuenta atrás para el próximo episodio de una serie en emisión, consultado
 * en vivo a TMDB (no se guarda: caducaría). Solo se muestra si ese episodio
 * TODAVÍA no está en nuestra lista local (si ya está, el flujo normal de
 * "Ver siguiente" ya lo cubre).
 */
export default function NextEpisodeCountdown({
  itemId,
  tmdbId,
  localEpisodes,
}: {
  itemId: string
  tmdbId: number
  localEpisodes: Episode[]
}) {
  const [next, setNext] = useState<TmdbNextEpisode | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    let alive = true
    getSeries(tmdbId)
      .then((s) => alive && setNext(s.nextEpisode ?? null))
      .catch(() => alive && setNext(null))
    return () => {
      alive = false
    }
  }, [tmdbId])

  if (!next || !next.airDate) return null

  const haveLocally = localEpisodes.some(
    (e) => e.season === next.season && e.episode === next.episode,
  )
  if (haveLocally) return null

  const days = daysUntil(next.airDate)
  const label = `S${next.season}E${next.episode}${next.title ? ' · ' + next.title : ''}`

  const sync = async () => {
    setSyncing(true)
    try {
      const n = await syncSeriesEpisodes(itemId)
      toast(n > 0 ? `${n} episodio${n === 1 ? '' : 's'} nuevo${n === 1 ? '' : 's'} añadido${n === 1 ? '' : 's'}` : 'Aún no aparece en TMDB')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="banner" style={{ marginLeft: 0, marginRight: 0 }}>
      <span>
        📅{' '}
        {days > 1 && `Próximo episodio ${label} · en ${days} días`}
        {days === 1 && `Próximo episodio ${label} · mañana`}
        {days === 0 && `Próximo episodio ${label} · ¡hoy!`}
        {days < 0 && `${label} ya debería estar disponible`}
      </span>
      {days <= 0 && (
        <button className="btn btn-sm" onClick={sync} disabled={syncing}>
          {syncing ? '…' : '🔄 Actualizar'}
        </button>
      )}
    </div>
  )
}
