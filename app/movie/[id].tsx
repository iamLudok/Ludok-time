import { useEffect, useState } from 'react'
import { ScrollView, View, StyleSheet, ActivityIndicator } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useItem, usePastWatches } from '../../src/hooks/useLibrary'
import { rewatchMovie, setStatus, statusLabel, updateItem } from '../../src/lib/library'
import { getMovieFull, type TmdbMovieFull } from '../../src/lib/tmdb'
import { DetailHead } from '../../src/ui/DetailHead'
import { Txt } from '../../src/ui/Text'
import { Button } from '../../src/ui/Button'
import { Empty } from '../../src/ui/Screen'
import { usePalette } from '../../src/ui/ThemeProvider'
import { useToast } from '../../src/ui/Toast'
import { space } from '../../src/ui/theme'
import { DetailControls } from '../../src/components/DetailControls'
import { WatchedDate } from '../../src/components/WatchedDate'
import { WhereToWatch } from '../../src/components/WhereToWatch'
import { SimilarTitles } from '../../src/components/SimilarTitles'
import { CastRow } from '../../src/components/CastRow'
import { MoviePastViewings } from '../../src/components/PastViewings'

export default function MovieDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const palette = usePalette()
  const toast = useToast()
  const item = useItem(id)
  const past = usePastWatches(id)

  const tmdbId = item?.source === 'tmdb' && item.sourceId ? Number(item.sourceId) : undefined
  const [tmdb, setTmdb] = useState<TmdbMovieFull | null | undefined>(undefined)

  useEffect(() => {
    if (!tmdbId) return
    let alive = true
    getMovieFull(tmdbId)
      .then((m) => alive && setTmdb(m))
      .catch(() => alive && setTmdb(null))
    return () => {
      alive = false
    }
  }, [tmdbId])

  if (item === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator color={palette.muted} />
      </View>
    )
  }
  if (!item) return <Empty text="No encontrada." />

  const watched = item.status === 'completed'

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <DetailHead
        poster={item.poster}
        type="movie"
        title={item.title}
        meta={[item.year, statusLabel(item.status), item.runtime ? `${item.runtime} min` : null]
          .filter(Boolean)
          .join(' · ')}
      >
        <Button
          title={watched ? 'Vista — desmarcar' : 'Marcar como vista'}
          kind={watched ? 'secondary' : 'primary'}
          small
          onPress={async () => {
            await setStatus(item.id, watched ? 'plan' : 'completed')
            toast(watched ? 'Marcada como pendiente' : '¡Vista!')
          }}
          style={styles.cta}
        />
        {watched && (
          <WatchedDate
            timestamp={item.completedAt}
            onChange={(ts) => updateItem(item.id, { completedAt: ts })}
          />
        )}
        {watched && (
          <Button
            title="La he vuelto a ver"
            small
            onPress={async () => {
              if (await rewatchMovie(item.id)) toast('Apuntada con fecha de hoy')
            }}
            style={styles.cta}
          />
        )}
        {watched && <MoviePastViewings itemId={item.id} past={past} />}
      </DetailHead>

      {item.overview ? (
        <Txt variant="small" tone="muted">
          {item.overview}
        </Txt>
      ) : null}

      {tmdbId && <WhereToWatch data={tmdb?.providers} title={item.title} />}

      <CastRow cast={tmdb?.cast} />
      {tmdbId && (
        <SimilarTitles
          results={tmdb?.similar}
          kind="movie"
          originalLanguage={tmdb?.movie.originalLanguage}
        />
      )}

      <DetailControls item={item} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cta: { alignSelf: 'flex-start', marginTop: space.xs },
})
