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

export default function EpisodeList({ itemId, episodes }: { itemId: string; episodes: Episode[] }) {
  const seasons = groupBySeason(episodes)

  const toggleSeason = async (seasonEps: Episode[]) => {
    const allWatched = seasonEps.every((e) => e.watched)
    await setSeasonWatched(itemId, seasonEps, !allWatched)
  }

  return (
    <div>
      {[...seasons.entries()].map(([season, seasonEps]) => {
        const watched = seasonEps.filter((e) => e.watched).length
        const allWatched = watched === seasonEps.length
        return (
          <div key={season}>
            <div className="season-head">
              <span>
                Temporada {season}{' '}
                <span className="muted" style={{ fontWeight: 400 }}>
                  ({watched}/{seasonEps.length})
                </span>
              </span>
              <button className="btn btn-sm" onClick={() => toggleSeason(seasonEps)}>
                {allWatched ? 'Desmarcar' : 'Marcar toda'}
              </button>
            </div>
            {seasonEps.map((e) => (
              <div className="ep" key={e.id}>
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
                  {e.watched && e.watchedAt && (
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
