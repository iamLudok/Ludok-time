import { useState } from 'react'
import type { TmdbNextEpisode } from '../lib/tmdb'
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
 * Cuenta atrás para el próximo episodio de una serie en emisión. `series` lo
 * calcula el padre (un solo fetch a TMDB compartido con "También te puede
 * gustar", en vez de que cada componente pida lo mismo por su cuenta).
 * Muestra SIEMPRE algún estado (incluido "sin fecha anunciada todavía") para
 * que quede claro que la app sí lo ha comprobado, salvo en series ya
 * terminadas/canceladas o mientras carga, donde no tiene sentido mostrar nada.
 */
export default function NextEpisodeCountdown({
  itemId,
  localEpisodes,
  series,
}: {
  itemId: string
  localEpisodes: Episode[]
  series: { inProduction?: boolean; nextEpisode?: TmdbNextEpisode } | null | undefined
}) {
  const [syncing, setSyncing] = useState(false)

  if (series === undefined || series === null) return null
  // Serie ya terminada/cancelada: no tiene sentido preguntar por el próximo episodio.
  if (series.inProduction === false) return null

  const next = series.nextEpisode
  const haveLocally =
    !!next && localEpisodes.some((e) => e.season === next.season && e.episode === next.episode)

  const sync = async () => {
    setSyncing(true)
    try {
      const { added, failedSeasons } = await syncSeriesEpisodes(itemId)
      if (added > 0) {
        toast(`${added} episodio${added === 1 ? '' : 's'} nuevo${added === 1 ? '' : 's'} añadido${added === 1 ? '' : 's'}`)
      } else {
        toast('Aún no aparece en TMDB')
      }
      if (failedSeasons > 0) {
        toast(`⚠️ ${failedSeasons} temporada${failedSeasons === 1 ? '' : 's'} no se pudo comprobar, inténtalo de nuevo`)
      }
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
