import { View, StyleSheet } from 'react-native'
import { usePalette } from './ThemeProvider'

/**
 * Línea de progreso fina. En «Sala oscura» el progreso no lleva número encima de
 * la carátula: es una línea que se llena, para no tapar el arte.
 */
export function Progress({ value }: { value: number }) {
  const palette = usePalette()
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <View style={[styles.track, { backgroundColor: palette.surface2 }]}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: palette.fg }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  track: { height: 2, width: '100%', overflow: 'hidden' },
  fill: { height: '100%' },
})
