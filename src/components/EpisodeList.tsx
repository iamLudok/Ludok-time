import { useState } from 'react'
import {
  setEpisodeWatched,
  setEpisodeWatchedAt,
  markWatchedUpTo,
  setSeasonWatched,
} from '../lib/library'
import WatchedDate from './WatchedDate'
import type { Episode } from '../types'

function groupBySeason(eps: Episode[]): Map<number, Episode[]> {
  const map = new Map<number, Episode[]>()
  for (const e of [...eps].sort((a, b) => a.season - b.season || a.episode - b.episode)) {
    if (!map.has(e.season)) map.set(e.season, [])
    map.get(e.season)!.push(e)
  }
  return map
}

/** Temporada abierta por defecto: la que tiene el próximo episodio pendiente
 * (o la última si ya está todo visto, o la primera si nada lo está). Las
 * demás empiezan plegadas para no tener que escrollear en series largas. */
function initialOpenSeason(entries: [number, Episode[]][]): number | null {
  const withPending = entries.find(([, eps]) => eps.some((e) => !e.watched))
  if (withPending) return withPending[0]
  return entries.length ? entries[entries.length - 1][0] : null
}

export default function EpisodeList({ itemId, episodes }: { itemId: string; episodes: Episode[] }) {
  const seasons = groupBySeason(episodes)
  const entries = [...seasons.entries()]

  const [open, setOpen] = useState<Set<number>>(() => {
    const initial = initialOpenSeason(entries)
    return new Set(initial === null ? [] : [initial])
  })

  const toggleOpen = (season: number) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(season)) next.delete(season)
      else next.add(season)
      return next
    })
  }

  const toggleSeason = async (seasonEps: Episode[]) => {
    const allWatched = seasonEps.every((e) => e.watched)
    await setSeasonWatched(itemId, seasonEps, !allWatched)
  }

  return (
    <div>
      {entries.map(([season, seasonEps]) => {
        const watched = seasonEps.filter((e) => e.watched).length
        const allWatched = watched === seasonEps.length
        const isOpen = open.has(season)
        return (
          <div key={season}>
            <div className="season-head">
              <button className="season-toggle" onClick={() => toggleOpen(season)}>
                <span className="chevron">{isOpen ? '▾' : '▸'}</span> Temporada {season}{' '}
                <span className="muted" style={{ fontWeight: 400 }}>
                  ({watched}/{seasonEps.length})
                </span>
              </button>
              <button className="btn btn-sm" onClick={() => toggleSeason(seasonEps)}>
                {allWatched ? 'Desmarcar' : 'Marcar toda'}
              </button>
            </div>
            {isOpen &&
              seasonEps.map((e) => (
                <div className="ep" key={e.id}>
                  {e.still ? (
                    <img className="ep-still" src={e.still} alt="" loading="lazy" />
                  ) : (
                    <div className="ep-still ep-still-fallback">🎬</div>
                  )}
                  <button
                    className={'ep-check' + (e.watched ? ' done' : '')}
                    onClick={() => setEpisodeWatched(e.id, !e.watched)}
                    aria-label={e.watched ? 'Marcar como no visto' : 'Marcar como visto'}
                  >
                    ✓
                  </button>
                  <div className="ep-main">
                    <div className="ep-title">
                      {e.episode}. {e.title || 'Episodio ' + e.episode}
                    </div>
                    {e.airDate && <div className="poster-sub">Emitido: {e.airDate}</div>}
                    {e.watched && (
                      <WatchedDate
                        timestamp={e.watchedAt}
                        onChange={(ts) => setEpisodeWatchedAt(e.id, ts)}
                      />
                    )}
                  </div>
                  {!e.watched && (
                    <button
                      className="btn btn-sm"
                      onClick={() => markWatchedUpTo(itemId, e.id)}
                      title="Marcar este y todos los anteriores"
                    >
                      hasta aquí
                    </button>
                  )}
                </div>
              ))}
          </div>
        )
      })}
    </div>
  )
}
