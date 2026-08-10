import { ScrollView, View, StyleSheet } from 'react-native'
import { Screen } from '../../src/ui/Screen'
import { Txt } from '../../src/ui/Text'
import { usePalette } from '../../src/ui/ThemeProvider'
import { radius, space } from '../../src/ui/theme'
import { useLibraryItems, useVideos, useAllEpisodes } from '../../src/hooks/useLibrary'
import type { Item } from '../../src/types'

const DEFAULT_EPISODE_MIN = 40
const DEFAULT_MOVIE_MIN = 110

/** Siempre «X d X h X min», incluidos los ceros, para un formato consistente. */
function fmtDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const days = Math.floor(total / 1440)
  const hours = Math.floor((total % 1440) / 60)
  const mins = total % 60
  return `${days} d ${hours} h ${mins} min`
}

export default function StatsScreen() {
  const { data: library } = useLibraryItems()
  const { data: videos } = useVideos()
  const episodes = useAllEpisodes()

  const seriesItems = library.filter((i) => i.type === 'series')
  const movies = library.filter((i) => i.type === 'movie')
  const books = library.filter((i) => i.type === 'book')

  // --- Series: duración real de TMDB cuando la hay, media orientativa si no.
  const watchedEps = episodes.filter((e) => e.watched)
  const seriesById = new Map<string, Item>(seriesItems.map((i) => [i.id, i]))
  let seriesMinutes = 0
  let seriesEstimated = 0
  for (const e of watchedEps) {
    const real = e.runtime || seriesById.get(e.itemId)?.runtime
    seriesMinutes += real || DEFAULT_EPISODE_MIN
    if (!real) seriesEstimated++
  }

  // --- Películas
  const moviesWatched = movies.filter((i) => i.status === 'completed')
  let moviesMinutes = 0
  let moviesEstimated = 0
  for (const m of moviesWatched) {
    moviesMinutes += m.runtime || DEFAULT_MOVIE_MIN
    if (!m.runtime) moviesEstimated++
  }

  // --- Libros
  const pagesRead = books.reduce((sum, b) => sum + (b.currentPage ?? 0), 0)

  return (
    <Screen title="Estadísticas" padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Section
          title="Series"
          stats={[
            { n: String(seriesItems.length), l: 'En biblioteca' },
            { n: String(seriesItems.filter((i) => i.status === 'completed').length), l: 'Completadas' },
            { n: String(watchedEps.length), l: 'Episodios vistos' },
            { n: fmtDuration(seriesMinutes), l: 'Tiempo visto' },
          ]}
          note={
            watchedEps.length === 0
              ? undefined
              : seriesEstimated > 0
                ? `Duración real de TMDB donde está disponible; ${seriesEstimated} episodio${seriesEstimated === 1 ? '' : 's'} sin ese dato se estimó en ${DEFAULT_EPISODE_MIN} min.`
                : 'Duración real de cada episodio, según TMDB.'
          }
        />

        <Section
          title="Películas"
          stats={[
            { n: String(movies.length), l: 'En biblioteca' },
            { n: String(moviesWatched.length), l: 'Vistas' },
            { n: fmtDuration(moviesMinutes), l: 'Tiempo visto' },
          ]}
          note={
            moviesWatched.length === 0
              ? undefined
              : moviesEstimated > 0
                ? `Duración real de TMDB donde está disponible; ${moviesEstimated} sin ese dato se estimó en ${DEFAULT_MOVIE_MIN} min.`
                : 'Duración real de cada película, según TMDB.'
          }
        />

        <Section
          title="Libros"
          stats={[
            { n: String(books.length), l: 'En biblioteca' },
            { n: String(books.filter((i) => i.status === 'completed').length), l: 'Leídos' },
            { n: String(pagesRead), l: 'Páginas leídas' },
          ]}
        />

        <Section title="Vídeos" stats={[{ n: String(videos.length), l: 'Guardados' }]} />
      </ScrollView>
    </Screen>
  )
}

function Section({
  title,
  stats,
  note,
}: {
  title: string
  stats: { n: string; l: string }[]
  note?: string
}) {
  const palette = usePalette()
  return (
    <View style={[styles.card, { borderColor: palette.line }]}>
      <Txt variant="section">{title}</Txt>
      <View style={styles.grid}>
        {stats.map((s) => (
          <View key={s.l} style={styles.stat}>
            <Txt variant="title" style={styles.number}>
              {s.n}
            </Txt>
            <Txt variant="data" tone="faint">
              {s.l}
            </Txt>
          </View>
        ))}
      </View>
      {note ? (
        <Txt variant="small" tone="faint">
          {note}
        </Txt>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  stat: { minWidth: 96, gap: 2 },
  number: { fontVariant: ['tabular-nums'] },
})
