import { useEffect, useState } from 'react'
import { ScrollView, View, StyleSheet, ActivityIndicator } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useItem } from '../../src/hooks/useLibrary'
import { setStatus, statusLabel, updateItem } from '../../src/lib/library'
import { getMovie } from '../../src/lib/tmdb'
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

export default function MovieDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const palette = usePalette()
  const toast = useToast()
  const item = useItem(id)

  const tmdbId = item?.source === 'tmdb' && item.sourceId ? Number(item.sourceId) : undefined
  const [originalLanguage, setOriginalLanguage] = useState<string | undefined>()

  useEffect(() => {
    if (!tmdbId) return
    let alive = true
    getMovie(tmdbId)
      .then((m) => alive && setOriginalLanguage(m.originalLanguage))
      .catch(() => {})
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
      </DetailHead>

      {item.overview ? (
        <Txt variant="small" tone="muted">
          {item.overview}
        </Txt>
      ) : null}

      {tmdbId && <WhereToWatch tmdbId={tmdbId} kind="movie" title={item.title} />}
      {tmdbId && (
        <SimilarTitles tmdbId={tmdbId} kind="movie" originalLanguage={originalLanguage} />
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
