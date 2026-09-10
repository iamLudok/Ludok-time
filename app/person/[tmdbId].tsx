import { useEffect, useMemo, useState } from 'react'
import { ScrollView, View, StyleSheet, Pressable, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getPersonFull, posterUrl, type TmdbPersonFull } from '../../src/lib/tmdb'
import { toggleFavourite } from '../../src/lib/people'
import { useIsFavourite } from '../../src/hooks/usePeople'
import { useLibraryItems } from '../../src/hooks/useLibrary'
import { Txt } from '../../src/ui/Text'
import { Button } from '../../src/ui/Button'
import { Poster } from '../../src/ui/Poster'
import { Empty } from '../../src/ui/Screen'
import { usePalette } from '../../src/ui/ThemeProvider'
import { useToast } from '../../src/ui/Toast'
import { radius, space } from '../../src/ui/theme'

const FACE = 104
const CARD = 92

/**
 * Perfil de un actor: quién es, si lo sigues, y todo lo que ha hecho.
 *
 * Nada de esto se guarda salvo que lo marques como favorito. Su filmografía
 * cambia y guardarla obligaría a mantenerla al día para nada.
 */
export default function PersonDetail() {
  const { tmdbId } = useLocalSearchParams<{ tmdbId: string }>()
  const router = useRouter()
  const palette = usePalette()
  const insets = useSafeAreaInsets()
  const toast = useToast()

  const id = Number(tmdbId)
  const [data, setData] = useState<TmdbPersonFull | null | undefined>(undefined)
  const favourite = useIsFavourite(id)
  const { data: mine } = useLibraryItems()

  useEffect(() => {
    if (Number.isNaN(id)) return
    let alive = true
    setData(undefined)
    getPersonFull(id)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null))
    return () => {
      alive = false
    }
  }, [id])

  /** Los que ya tienes, para marcarlos en su filmografía. */
  const owned = useMemo(
    () => new Set(mine.filter((i) => i.source === 'tmdb').map((i) => i.sourceId)),
    [mine],
  )

  if (Number.isNaN(id)) return <Empty text="Actor no válido." />

  if (data === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator color={palette.muted} />
      </View>
    )
  }
  if (data === null) return <Empty text="No se pudo cargar este actor." />

  const { person, credits } = data

  const toggle = async () => {
    const now = await toggleFavourite({
      tmdbId: person.id,
      name: person.name,
      photo: person.photoPath ? posterUrl(person.photoPath, 'w185') : undefined,
    })
    toast(now ? `Sigues a ${person.name}` : `Ya no sigues a ${person.name}`)
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm }]}
      showsVerticalScrollIndicator={false}
    >
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
        <Txt variant="title" tone="muted">
          ‹
        </Txt>
        <Txt variant="small" tone="muted">
          Volver
        </Txt>
      </Pressable>

      <View style={styles.head}>
        {person.photoPath ? (
          <Image
            source={{ uri: posterUrl(person.photoPath, 'w342') }}
            style={[styles.face, { backgroundColor: palette.surface2 }]}
            contentFit="cover"
            transition={140}
            cachePolicy="disk"
          />
        ) : (
          <View style={[styles.face, styles.empty, { backgroundColor: palette.surface2 }]}>
            <Txt variant="title" tone="faint">
              {person.name.slice(0, 1)}
            </Txt>
          </View>
        )}
        <View style={styles.headMain}>
          <Txt variant="title" numberOfLines={3}>
            {person.name}
          </Txt>
          <Txt variant="small" tone="muted">
            {[person.knownFor, person.placeOfBirth].filter(Boolean).join(' · ')}
          </Txt>
          <Button
            title={favourite ? '★ Le sigues' : '☆ Seguir'}
            kind={favourite ? 'secondary' : 'primary'}
            small
            onPress={toggle}
            style={styles.cta}
          />
        </View>
      </View>

      {favourite ? (
        <Txt variant="small" tone="faint">
          Sus estrenos aparecerán en Próximos.
        </Txt>
      ) : null}

      {person.biography ? (
        <Txt variant="small" tone="muted" numberOfLines={8}>
          {person.biography}
        </Txt>
      ) : null}

      <View style={styles.block}>
        <View style={styles.rowBetween}>
          <Txt variant="section">Ha hecho</Txt>
          <Txt variant="data" tone="faint">
            {credits.length}
          </Txt>
        </View>
        <View style={styles.grid}>
          {credits.map((c) => {
            const have = owned.has(String(c.id))
            return (
              <Pressable
                key={`${c.mediaType}-${c.id}`}
                onPress={() => router.push(`/preview/${c.mediaType === 'tv' ? 'tv' : 'movie'}/${c.id}`)}
                style={({ pressed }) => [{ width: CARD, opacity: pressed ? 0.65 : 1 }]}
              >
                <View>
                  <Poster
                    uri={c.posterPath ? posterUrl(c.posterPath, 'w185') : undefined}
                    type={c.mediaType === 'tv' ? 'series' : 'movie'}
                    title={c.title}
                    width={CARD}
                  />
                  {have && (
                    <View style={[styles.mark, { backgroundColor: palette.on }]}>
                      <Txt style={{ color: palette.onFg, fontSize: 11, lineHeight: 14 }}>✓</Txt>
                    </View>
                  )}
                </View>
                <Txt variant="small" numberOfLines={2} style={styles.title}>
                  {c.title}
                </Txt>
                <Txt variant="data" tone="faint" numberOfLines={1}>
                  {[c.date?.slice(0, 4), c.mediaType === 'tv' ? 'Serie' : 'Peli']
                    .filter(Boolean)
                    .join(' · ')}
                </Txt>
              </Pressable>
            )
          })}
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  head: { flexDirection: 'row', gap: space.lg },
  face: { width: FACE, height: FACE, borderRadius: radius.pill },
  empty: { alignItems: 'center', justifyContent: 'center' },
  headMain: { flex: 1, minWidth: 0, gap: space.xs },
  cta: { alignSelf: 'flex-start', marginTop: space.xs },
  block: { gap: space.sm },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  title: { fontWeight: '600', paddingTop: space.xs },
  mark: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
