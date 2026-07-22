import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { statusLabel, isAnime, bookPercent } from '../lib/library'
import type { Episode, Item } from '../types'

const TYPE_EMOJI: Record<string, string> = {
  series: '📺',
  movie: '🎬',
  book: '📖',
  youtube: '▶️',
  custom: '⭐',
}

function itemEmoji(item: Item): string {
  if (isAnime(item)) return '🌸'
  return TYPE_EMOJI[item.type] ?? '⭐'
}

function detailPath(item: Item): string {
  if (item.type === 'series') return `/series/${item.id}`
  if (item.type === 'book') return `/book/${item.id}`
  return `/movie/${item.id}`
}

export default function ItemCard({ item }: { item: Item }) {
  const isSeries = item.type === 'series'
  const eps = useLiveQuery(
    () =>
      isSeries
        ? db.episodes.where('itemId').equals(item.id).toArray()
        : Promise.resolve([] as Episode[]),
    [item.id, isSeries],
    [] as Episode[],
  )
  const total = eps?.length ?? 0
  const watched = eps?.filter((e) => e.watched).length ?? 0
  const percent = total ? Math.round((watched / total) * 100) : 0

  return (
    <Link to={detailPath(item)} className="poster-card">
      <div className="poster-wrap">
        {item.poster ? (
          <img src={item.poster} alt={item.title} loading="lazy" />
        ) : (
          <div className="poster-fallback">{itemEmoji(item)}</div>
        )}
      </div>
      <div className="poster-body">
        <div className="poster-title">{item.title}</div>
        <div className="poster-sub">
          {itemEmoji(item)} {item.year ?? ''}
          {item.rating > 0 && <> · ⭐{item.rating}</>}
        </div>
        {isSeries && total > 0 ? (
          <>
            <div className="progress">
              <span style={{ width: `${percent}%` }} />
            </div>
            <div className="poster-sub">
              {watched}/{total} episodios
            </div>
          </>
        ) : item.type === 'book' && item.totalPages ? (
          <>
            <div className="progress">
              <span style={{ width: `${bookPercent(item)}%` }} />
            </div>
            <div className="poster-sub">
              {item.currentPage ?? 0}/{item.totalPages} págs.
            </div>
          </>
        ) : (
          <span className={'badge status-' + item.status}>
            {statusLabel(item.status, item.type)}
          </span>
        )}
      </div>
    </Link>
  )
}
