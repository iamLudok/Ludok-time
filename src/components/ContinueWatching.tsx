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
      const next = episodes
        .filter((e) => e.itemId === item.id)
        .sort((a, b) => a.season - b.season || a.episode - b.episode)
        .find((e) => !e.watched)
      return next ? { item, next } : null
    })
    .filter((r): r is { item: Item; next: Episode } => r !== null)

  if (rows.length === 0) return null

  return (
    <View style={styles.wrap}>
      <Txt variant="label" tone="muted">
        Continuar viendo
      </Txt>
      {rows.map(({ item, next }) => (
        <View key={item.id} style={[styles.row, { borderColor: palette.line }]}>
          <Pressable onPress={() => router.push(`/series/${item.id}`)} style={styles.tap}>
            <Poster uri={item.poster} type={item.type} title={item.title} width={40} />
            <View style={styles.main}>
              <Txt variant="section" numberOfLines={1}>
                {item.title}
              </Txt>
              <Txt variant="small" tone="muted" numberOfLines={1}>
                {epLabel(next)}
              </Txt>
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
})
