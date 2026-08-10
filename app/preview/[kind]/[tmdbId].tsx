import { useEffect, useState } from 'react'
import { ScrollView, View, StyleSheet, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useLiveQuery } from 'drizzle-orm/expo-sqlite'
import { and, eq } from 'drizzle-orm'
import { db } from '../../../src/lib/db'
import { items as itemsTable } from '../../../src/lib/schema'
import { getSeries, getMovie, posterUrl, type TmdbSeries, type TmdbMovie } from '../../../src/lib/tmdb'
import { addSeriesFromTmdb, addMovieFromTmdb } from '../../../src/lib/library'
import { DetailHead } from '../../../src/ui/DetailHead'
import { Txt } from '../../../src/ui/Text'
import { Button } from '../../../src/ui/Button'
import { Empty } from '../../../src/ui/Screen'
import { usePalette } from '../../../src/ui/ThemeProvider'
import { useToast } from '../../../src/ui/Toast'
import { radius, space } from '../../../src/ui/theme'
import { WhereToWatch } from '../../../src/components/WhereToWatch'
import { SimilarTitles } from '../../../src/components/SimilarTitles'

/**
 * Vista previa de un título de TMDB SIN añadirlo: sinopsis, temporadas y dónde
 * verlo. Nada se guarda hasta pulsar «Añadir»; si ya lo tienes, en vez de
 * añadir te lleva a su ficha.
 */
export default function Preview() {
  const { kind, tmdbId } = useLocalSearchParams<{ kind: string; tmdbId: string }>()
  const router = useRouter()
  const palette = usePalette()
  const toast = useToast()

  const isSeries = kind === 'tv'
  const id = Number(tmdbId)
  const [data, setData] = useState<TmdbSeries | TmdbMovie | null | undefined>(undefined)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (Number.isNaN(id)) return
    setData(undefined)
    const fetcher = isSeries ? getSeries(id) : getMovie(id)
    fetcher.then(setData).catch(() => setData(null))
  }, [id, isSeries])

  const { data: mine } = useLiveQuery(
    db
      .select()
      .from(itemsTable)
      .where(
        and(
          eq(itemsTable.source, 'tmdb'),
          eq(itemsTable.sourceId, String(id)),
          eq(itemsTable.type, isSeries ? 'series' : 'movie'),
        ),
      ),
  )
  const existing = mine?.[0]

  if (!tmdbId || Number.isNaN(id)) return <Empty text="Título no válido." />

  if (data === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator color={palette.muted} />
      </View>
    )
  }
  if (data === null) return <Empty text="No se pudo cargar este título." />

  const series = isSeries ? (data as TmdbSeries) : null
  const movie = !isSeries ? (data as TmdbMovie) : null
  const totalEpisodes = series?.seasons.reduce((sum, s) => sum + s.episodeCount, 0) ?? 0

  const add = async () => {
    setAdding(true)
    try {
      if (isSeries) {
        const { id: localId, failedSeasons } = await addSeriesFromTmdb(id, 'plan')
        toast(`Añadido: ${data.title}`)
        if (failedSeasons > 0) {
          toast(`${failedSeasons} temporada${failedSeasons === 1 ? '' : 's'} sin cargar; usa Actualizar`)
        }
        router.replace(`/series/${localId}`)
      } else {
        const localId = await addMovieFromTmdb(id, 'movie', 'plan')
        toast(`Añadido: ${data.title}`)
        router.replace(`/movie/${localId}`)
      }
    } catch {
      toast('No se pudo añadir')
    } finally {
      setAdding(false)
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <DetailHead
        poster={data.posterPath ? posterUrl(data.posterPath, 'w342') : undefined}
        type={isSeries ? 'series' : 'movie'}
        title={data.title}
        meta={[
          data.year,
          isSeries ? 'Serie' : 'Película',
          movie?.runtime ? `${movie.runtime} min` : null,
          series ? `${series.seasons.length} temp. · ${totalEpisodes} episodios` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      >
        {existing ? (
          <Button
            title="Ya la tienes · Ver ficha"
            kind="primary"
            small
            style={styles.cta}
            onPress={() =>
              router.replace(`/${isSeries ? 'series' : 'movie'}/${existing.id}`)
            }
          />
        ) : (
          <Button
            title={adding ? 'Añadiendo…' : isSeries ? 'Añadir serie' : 'Añadir película'}
            kind="primary"
            small
            style={styles.cta}
            onPress={add}
            disabled={adding}
          />
        )}
      </DetailHead>

      {data.overview ? (
        <Txt variant="small" tone="muted">
          {data.overview}
        </Txt>
      ) : null}

      {series && series.seasons.length > 0 && (
        <View style={[styles.card, { borderColor: palette.line }]}>
          <Txt variant="section">Temporadas</Txt>
          {series.seasons.map((s) => (
            <View key={s.seasonNumber} style={styles.row}>
              <Txt variant="small">{s.name || `Temporada ${s.seasonNumber}`}</Txt>
              <Txt variant="data" tone="faint">
                {s.episodeCount} episodios
              </Txt>
            </View>
          ))}
        </View>
      )}

      <WhereToWatch tmdbId={id} kind={isSeries ? 'tv' : 'movie'} title={data.title} />
      <SimilarTitles
        tmdbId={id}
        kind={isSeries ? 'tv' : 'movie'}
        originalLanguage={data.originalLanguage}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cta: { alignSelf: 'flex-start', marginTop: space.xs },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.md },
})
