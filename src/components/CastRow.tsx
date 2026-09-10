import { View, ScrollView, StyleSheet, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import { posterUrl, type TmdbCastMember } from '../lib/tmdb'
import { useFavourites } from '../hooks/usePeople'
import { usePalette } from '../ui/ThemeProvider'
import { Txt } from '../ui/Text'
import { radius, space } from '../ui/theme'

const FACE = 72
/**
 * TMDB devuelve el reparto entero — Sex Education trae 149 personas — ordenado
 * de más a menos relevante. Con los primeros basta: el resto son papeles de un
 * episodio suelto y solo servirían para hacer la fila infinita.
 */
const HOW_MANY = 12

export function CastRow({ cast }: { cast: TmdbCastMember[] | undefined }) {
  const router = useRouter()
  const palette = usePalette()
  const { data: favourites } = useFavourites()

  if (!cast || cast.length === 0) return null
  const shown = cast.slice(0, HOW_MANY)

  return (
    <View style={styles.wrap}>
      <Txt variant="section">Reparto</Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {shown.map((actor) => {
          const fav = favourites.some((p) => p.tmdbId === actor.id)
          return (
            <Pressable
              key={actor.id}
              onPress={() => router.push(`/person/${actor.id}`)}
              style={({ pressed }) => [styles.card, { opacity: pressed ? 0.65 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={`${actor.name}${fav ? ', entre tus favoritos' : ''}`}
            >
              <View>
                {actor.photoPath ? (
                  <Image
                    source={{ uri: posterUrl(actor.photoPath, 'w185') }}
                    style={[styles.face, { backgroundColor: palette.surface2 }]}
                    contentFit="cover"
                    transition={140}
                    cachePolicy="disk"
                  />
                ) : (
                  <View style={[styles.face, styles.empty, { backgroundColor: palette.surface2 }]}>
                    <Txt variant="small" tone="faint">
                      {actor.name.slice(0, 1)}
                    </Txt>
                  </View>
                )}
                {fav && (
                  <View style={[styles.mark, { backgroundColor: palette.on }]}>
                    <Txt style={{ color: palette.onFg, fontSize: 10, lineHeight: 13 }}>★</Txt>
                  </View>
                )}
              </View>
              <Txt variant="small" numberOfLines={2} style={styles.name}>
                {actor.name}
              </Txt>
              {actor.character ? (
                <Txt variant="data" tone="faint" numberOfLines={2}>
                  {actor.character}
                </Txt>
              ) : null}
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: { gap: space.md, paddingRight: space.lg },
  card: { width: FACE, gap: 2 },
  face: { width: FACE, height: FACE, borderRadius: radius.pill },
  empty: { alignItems: 'center', justifyContent: 'center' },
  mark: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontWeight: '600', paddingTop: space.xs },
})
