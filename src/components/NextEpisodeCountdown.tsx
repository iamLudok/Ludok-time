import { useEffect, useState } from 'react'
import { getSeries, type TmdbNextEpisode } from '../lib/tmdb'
import { syncSeriesEpisodes } from '../lib/library'
import { toast } from '../lib/toast'
import type { Episode } from '../types'

/** TMDB ya no va a anunciar más episodios para estos estados. */
const FINISHED_STATUSES = ['Ended', 'Canceled']

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00').getTime()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target - today.getTime()) / 86_400_000)
}

/**
 * Cuenta atrás para el próximo episodio de una serie en emisión, consultado
 * en vivo a TMDB (no se guarda: caducaría). Muestra SIEMPRE algún estado
 * (incluido "sin fecha anunciada todavía") para que quede claro que la app
 * sí lo ha comprobado, salvo en series ya terminadas/canceladas o mientras
 * carga, donde no tiene sentido mostrar nada.
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
  const [series, setSeries] = useState<
    { status?: string; nextEpisode?: TmdbNextEpisode } | null | undefined
  >(undefined)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    let alive = true
    setSeries(undefined)
    getSeries(tmdbId)
      .then((s) => alive && setSeries({ status: s.status, nextEpisode: s.nextEpisode }))
      .catch(() => alive && setSeries(null)) // fallo de red: no molestar, aviso secundario
    return () => {
      alive = false
    }
  }, [tmdbId])

  if (series === undefined || series === null) return null
  if (series.status && FINISHED_STATUSES.includes(series.status)) return null

  const next = series.nextEpisode
  const haveLocally =
    !!next && localEpisodes.some((e) => e.season === next.season && e.episode === next.episode)

  const sync = async () => {
    setSyncing(true)
    try {
      const n = await syncSeriesEpisodes(itemId)
      toast(
        n > 0
          ? `${n} episodio${n === 1 ? '' : 's'} nuevo${n === 1 ? '' : 's'} añadido${n === 1 ? '' : 's'}`
          : 'Aún no aparece en TMDB',
      )
    } finally {
      setSyncing(false)
    }
  }

  // Ya lo tenemos guardado localmente: lo gestiona "▶ Ver siguiente", no hay
  // nada más que decir aquí.
  if (haveLocally) return null

  // Sin fecha anunciada todavía: lo decimos explícitamente para que quede
  // claro que la app SÍ lo ha comprobado (y no que algo esté roto).
  if (!next || !next.airDate) {
    return (
      <div className="banner" style={{ marginLeft: 0, marginRight: 0 }}>
        <span className="muted">📅 Sin fecha anunciada todavía para el próximo episodio.</span>
      </div>
    )
  }

  const days = daysUntil(next.airDate)
  const label = `S${next.season}E${next.episode}${next.title ? ' · ' + next.title : ''}`

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
