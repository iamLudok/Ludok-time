import { View, ScrollView, StyleSheet, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import { useFavourites } from '../hooks/usePeople'
import { usePalette } from '../ui/ThemeProvider'
import { Txt } from '../ui/Text'
import { radius, space } from '../ui/theme'

const FACE = 52

/**
 * Tus actores, en la Biblioteca.
 *
 * Desaparece del todo cuando no sigues a nadie, igual que «Continuar viendo»:
 * una sección vacía ocupando sitio en la pantalla que más se abre no le hace
 * ningún favor a nadie.
 */
export function FavouritePeople() {
  const router = useRouter()
  const palette = usePalette()
  const { data } = useFavourites()

  if (data.length === 0) return null

  return (
    <View style={styles.wrap}>
      <Txt variant="label" tone="muted">
        Tus actores
      </Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {data.map((person) => (
          <Pressable
            key={person.id}
            onPress={() => router.push(`/person/${person.tmdbId}`)}
            style={({ pressed }) => [styles.card, { opacity: pressed ? 0.65 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={person.name}
          >
            {person.photo ? (
              <Image
                source={{ uri: person.photo }}
                style={[styles.face, { backgroundColor: palette.surface2 }]}
                contentFit="cover"
                cachePolicy="disk"
              />
            ) : (
              <View style={[styles.face, styles.empty, { backgroundColor: palette.surface2 }]}>
                <Txt variant="small" tone="faint">
                  {person.name.slice(0, 1)}
                </Txt>
              </View>
            )}
            <Txt variant="data" tone="muted" numberOfLines={2} style={styles.name}>
              {person.name}
            </Txt>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, marginBottom: space.md },
  row: { gap: space.md, paddingRight: space.lg },
  card: { width: FACE, gap: 2 },
  face: { width: FACE, height: FACE, borderRadius: radius.pill },
  empty: { alignItems: 'center', justifyContent: 'center' },
  name: { textAlign: 'center' },
})
