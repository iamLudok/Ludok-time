import { View, StyleSheet, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePalette } from './ThemeProvider'
import { Txt } from './Text'
import { Poster } from './Poster'
import { space } from './theme'
import type { MediaType } from '../types'

/**
 * Cabecera común de las fichas: botón de volver, carátula y datos. La flecha es
 * grande y pegada al borde porque en el móvil se usa con el pulgar.
 */
export function DetailHead({
  poster,
  type,
  title,
  meta,
  children,
}: {
  poster?: string
  type: MediaType
  title: string
  meta?: string
  children?: React.ReactNode
}) {
  const router = useRouter()
  const palette = usePalette()
  const insets = useSafeAreaInsets()

  return (
    <View style={{ paddingTop: insets.top + space.sm }}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Volver"
        style={styles.back}
      >
        <Txt variant="title" tone="muted">
          ‹
        </Txt>
        <Txt variant="small" tone="muted">
          Volver
        </Txt>
      </Pressable>

      <View style={styles.head}>
        <Poster uri={poster} type={type} title={title} width={104} />
        <View style={styles.info}>
          <Txt variant="title" numberOfLines={3}>
            {title}
          </Txt>
          {meta && (
            <Txt variant="small" tone="muted">
              {meta}
            </Txt>
          )}
          {children}
        </View>
      </View>
      <View style={[styles.rule, { backgroundColor: palette.line }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingBottom: space.sm },
  head: { flexDirection: 'row', gap: space.lg, paddingBottom: space.lg },
  info: { flex: 1, minWidth: 0, gap: space.xs },
  rule: { height: StyleSheet.hairlineWidth },
})
