import { View, StyleSheet, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { setEpisodeWatched, epLabel } from '../lib/library'
import { usePalette } from '../ui/ThemeProvider'
import { Txt } from '../ui/Text'
import { Poster } from '../ui/Poster'
import { Tick } from '../ui/Tick'
import { space } from '../ui/theme'
import type { Item, Episode } from '../types'

/**
 * Series en «Viendo» con su próximo episodio, marcable ahí mismo sin entrar en
 * la ficha. Es lo primero de la Biblioteca porque es lo que se usa a diario.
 */
export function ContinueWatching({
  items,
  episodes,
}: {
  items: Item[]
  /** Los pasa la Biblioteca, que ya los tiene: así no se consulta dos veces. */
  episodes: Episode[]
}) {
  const router = useRouter()
  const palette = usePalette()

  const rows = items
    .map((item) => {
      const mine = episodes.filter((e) => e.itemId === item.id)
      const next = [...mine]
        .sort((a, b) => a.season - b.season || a.episode - b.episode)
        .find((e) => !e.watched)
      // Lo último que marcaste de esta serie: es lo que decide el orden.
      const lastWatched = mine.reduce((max, e) => Math.max(max, e.watchedAt ?? 0), 0)
      const left = mine.filter((e) => !e.watched).length
      return next ? { item, next, lastWatched, left } : null
    })
    .filter((r): r is { item: Item; next: Episode; lastWatched: number; left: number } => r !== null)
    // La que acabas de ver, arriba. Sort estable: las que nunca has marcado
    // (lastWatched 0) se quedan al final en el orden en que ya venían.
    .sort((a, b) => b.lastWatched - a.lastWatched)

  if (rows.length === 0) return null

  return (
    <View style={styles.wrap}>
      <Txt variant="label" tone="muted">
        Continuar viendo
      </Txt>
      {rows.map(({ item, next, left }) => (
        <View key={item.id} style={[styles.row, { borderColor: palette.line }]}>
          <Pressable onPress={() => router.push(`/series/${item.id}`)} style={styles.tap}>
            <Poster uri={item.poster} type={item.type} title={item.title} width={40} />
            <View style={styles.main}>
              <Txt variant="section" numberOfLines={1}>
                {item.title}
              </Txt>
              <View style={styles.sub}>
                <Txt variant="small" tone="muted" numberOfLines={1} style={styles.epLabel}>
                  {epLabel(next)}
                </Txt>
                <Txt variant="small" tone="faint">
                  · {left === 1 ? 'queda 1' : `quedan ${left}`}
                </Txt>
              </View>
            </View>
          </Pressable>
          <Tick
            on={false}
            onPress={() => setEpisodeWatched(next.id, true)}
            label={`Marcar visto ${epLabel(next)}`}
          />
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, marginBottom: space.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minWidth: 0 },
  main: { flex: 1, minWidth: 0, gap: 2 },
  // El título del episodio es lo que se recorta si no cabe, no el «quedan N».
  sub: { flexDirection: 'row', gap: space.xs },
  epLabel: { flexShrink: 1 },
})
