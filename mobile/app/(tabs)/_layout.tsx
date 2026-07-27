import { Tabs } from 'expo-router'
import { View, StyleSheet, type ColorValue } from 'react-native'
import { usePalette } from '../../src/ui/ThemeProvider'
import { radius } from '../../src/ui/theme'

/**
 * Las cinco pestañas de siempre. Los iconos son formas geométricas dibujadas
 * con CSS en vez de emojis: en «Sala oscura» la interfaz es monocroma, y un
 * emoji a color rompería justo eso.
 */
type Shape = 'library' | 'add' | 'video' | 'stats' | 'settings'

function Icon({ shape, color }: { shape: Shape; color: ColorValue }) {
  if (shape === 'library') {
    return (
      <View style={styles.row}>
        <View style={[styles.bar, { backgroundColor: color, height: 15 }]} />
        <View style={[styles.bar, { backgroundColor: color, height: 18 }]} />
        <View style={[styles.bar, { backgroundColor: color, height: 12 }]} />
      </View>
    )
  }
  if (shape === 'add') {
    return (
      <View style={styles.box}>
        <View style={[styles.plusH, { backgroundColor: color }]} />
        <View style={[styles.plusV, { backgroundColor: color }]} />
      </View>
    )
  }
  if (shape === 'video') {
    return <View style={[styles.tri, { borderLeftColor: color }]} />
  }
  if (shape === 'stats') {
    return (
      <View style={[styles.row, { alignItems: 'flex-end' }]}>
        <View style={[styles.bar, { backgroundColor: color, height: 7 }]} />
        <View style={[styles.bar, { backgroundColor: color, height: 14 }]} />
        <View style={[styles.bar, { backgroundColor: color, height: 18 }]} />
      </View>
    )
  }
  return (
    <View style={styles.box}>
      <View style={[styles.ring, { borderColor: color }]} />
    </View>
  )
}

export default function TabsLayout() {
  const palette = usePalette()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: palette.bg },
        tabBarActiveTintColor: palette.fg,
        tabBarInactiveTintColor: palette.faint,
        tabBarStyle: {
          backgroundColor: palette.bg,
          borderTopColor: palette.line,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 62,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Biblioteca',
          tabBarIcon: ({ color }) => <Icon shape="library" color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: 'Añadir', tabBarIcon: ({ color }) => <Icon shape="add" color={color} /> }}
      />
      <Tabs.Screen
        name="videos"
        options={{ title: 'Vídeos', tabBarIcon: ({ color }) => <Icon shape="video" color={color} /> }}
      />
      <Tabs.Screen
        name="stats"
        options={{ title: 'Stats', tabBarIcon: ({ color }) => <Icon shape="stats" color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Ajustes',
          tabBarIcon: ({ color }) => <Icon shape="settings" color={color} />,
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2.5, height: 20 },
  bar: { width: 3.5, borderRadius: 1.5 },
  box: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  plusH: { position: 'absolute', width: 16, height: 3, borderRadius: 1.5 },
  plusV: { position: 'absolute', width: 3, height: 16, borderRadius: 1.5 },
  tri: {
    width: 0,
    height: 0,
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderLeftWidth: 13,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  ring: { width: 17, height: 17, borderRadius: radius.pill, borderWidth: 3 },
})
