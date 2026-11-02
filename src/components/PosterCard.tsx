import { Pressable, View, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Poster } from '../ui/Poster'
import { Progress } from '../ui/Progress'
import { Txt } from '../ui/Text'
import { usePalette } from '../ui/ThemeProvider'
import { bookPercent } from '../lib/library'
import { radius, space } from '../ui/theme'
import type { Item, Episode } from '../types'

const ROUTE: Record<string, string> = {
  series: 'series',
  movie: 'movie',
  book: 'book',
}

/** Episodios vistos y totales de una serie, ya contados. */
export interface EpisodeCount {
  watched: number
  total: number
}

/**
 * Cuenta los episodios de todas las series de una pasada.
 *
 * La tarjeta recibe el resultado ya hecho en vez del array entero: si cada una
 * filtrara la lista completa por su cuenta, el coste sería «tarjetas visibles ×
 * episodios totales» en cada repintado, y aquí ya hay más de mil episodios.
 */
export function countEpisodes(episodes: Episode[]): Map<string, EpisodeCount> {
  const counts = new Map<string, EpisodeCount>()
  for (const e of episodes) {
    const c = counts.get(e.itemId) ?? { watched: 0, total: 0 }
    c.total++
    if (e.watched) c.watched++
    counts.set(e.itemId, c)
  }
  return counts
}

/**
 * Tarjeta de la rejilla. En «Sala oscura» la carátula ocupa todo y el texto va
 * debajo, pequeño: el arte es lo que reconoces de un vistazo. Lo completado se
 * marca con un tick sobre la esquina, sin teñir la imagen.
 */
export function PosterCard({
  item,
  count,
  width,
}: {
  item: Item
  count?: EpisodeCount
  width: number
}) {
  const router = useRouter()
  const palette = usePalette()

  const watched = count?.watched ?? 0
  const total = count?.total ?? 0
  const done = item.status === 'completed'

  let progress = 0
  let meta = ''
  if (item.type === 'series') {
    progress = total ? watched / total : 0
    meta = `${watched}/${total}`
  } else if (item.type === 'book') {
    progress = bookPercent(item) / 100
    meta = item.totalPages ? `pág. ${item.currentPage ?? 0}/${item.totalPages}` : 'libro'
  } else {
    progress = done ? 1 : 0
    meta = item.year ? String(item.year) : 'película'
  }
  if (item.rating > 0) meta += ` · ${item.rating}`

  return (
    <Pressable
      onPress={() => router.push(`/${ROUTE[item.type] ?? 'series'}/${item.id}`)}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.65 : 1 }]}
    >
      <View style={styles.artWrap}>
        <Poster uri={item.poster} type={item.type} title={item.title} width={width} />
        {done && (
          <View style={[styles.badge, { backgroundColor: palette.on }]}>
            <Txt variant="small" style={{ color: palette.onFg, fontSize: 11, lineHeight: 14 }}>
              ✓
            </Txt>
          </View>
        )}
      </View>
      <Progress value={progress} />
      <View style={styles.text}>
        <Txt variant="small" numberOfLines={2} style={styles.title}>
          {item.title}
        </Txt>
        <Txt variant="data" tone="faint">
          {meta}
        </Txt>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  artWrap: { position: 'relative' },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { paddingTop: space.xs, gap: 1 },
  title: { fontWeight: '600', lineHeight: 16 },
})
