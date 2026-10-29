import { useEffect, useState } from 'react'
import { ScrollView, View, StyleSheet, ActivityIndicator } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useItem, useEpisodes, usePastWatches } from '../../src/hooks/useLibrary'
import {
  setEpisodeWatched,
  undoRewatch,
  updateItem,
  backfillEpisodeStills,
  dropUnairedEpisodes,
  dropUnannouncedSeasons,
  syncSeriesEpisodes,
} from '../../src/lib/library'
import { getSeriesFull, type TmdbSeriesFull } from '../../src/lib/tmdb'
import type { Episode } from '../../src/types'
import { DetailHead } from '../../src/ui/DetailHead'
import { Txt } from '../../src/ui/Text'
import { Button } from '../../src/ui/Button'
import { Empty } from '../../src/ui/Screen'
import { usePalette } from '../../src/ui/ThemeProvider'
import { useToast } from '../../src/ui/Toast'
import { space, radius } from '../../src/ui/theme'
import { EpisodeList } from '../../src/components/EpisodeList'
import { DetailControls } from '../../src/components/DetailControls'
import { WatchedDate } from '../../src/components/WatchedDate'
import { WhereToWatch } from '../../src/components/WhereToWatch'
import { SimilarTitles } from '../../src/components/SimilarTitles'
import { CastRow } from '../../src/components/CastRow'
import { PastViewings, askRewatch } from '../../src/components/PastViewings'

export default function SeriesDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const palette = usePalette()
  const toast = useToast()
  const item = useItem(id)
  const episodes = useEpisodes(id)
  const past = usePastWatches(id)

  const tmdbId = item?.source === 'tmdb' && item.sourceId ? Number(item.sourceId) : undefined
  // UNA sola petición para toda la ficha: datos, dónde verla y similares.
  // `append_to_response` de TMDB deja pedirlo junto; antes eran tres peticiones
  // compitiendo entre sí cada vez que abrías una serie.
  const [tmdb, setTmdb] = useState<TmdbSeriesFull | null | undefined>(undefined)

  useEffect(() => {
    if (!tmdbId) {
      setTmdb(null)
      return
    }
    let alive = true
    setTmdb(undefined)
    getSeriesFull(tmdbId)
      .then((s) => alive && setTmdb(s))
      .catch(() => alive && setTmdb(null))
    return () => {
      alive = false
    }
  }, [tmdbId])

  // Al entrar se hacen tres arreglos silenciosos, sin tocar nada de lo marcado:
  // rellenar las fotos de las series añadidas antes de que existieran, quitar
  // episodios que aún no se han emitido, y quitar los de una temporada que
  // TMDB había anunciado como "plantilla" (sin fecha, a veces sin nombre ni
  // foto) y que al final no ha llegado a anunciarse de verdad.
  useEffect(() => {
    if (!id || !tmdbId) return
    backfillEpisodeStills(id).catch(() => {})
    dropUnairedEpisodes(id).catch(() => {})
    dropUnannouncedSeasons(id).catch(() => {})
  }, [id, tmdbId])

  if (item === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator color={palette.muted} />
      </View>
    )
  }
  if (!item) return <Empty text="No encontrado." />

  const watched = episodes.filter((e) => e.watched).length
  const next = episodes.find((e) => !e.watched)

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <DetailHead
        poster={item.poster}
        type="series"
        title={item.title}
        meta={[
          item.year,
          `${watched}/${episodes.length} episodios`,
          tmdb?.series.genres.slice(0, 2).join(', ') || null,
          tmdb?.series.networks[0] || null,
          tmdb?.series.voteAverage
            ? `TMDB ${tmdb.series.voteAverage.toFixed(1)}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      >
        {next && (
          <Button
            title={`Ver siguiente: S${next.season}E${next.episode}`}
            kind="primary"
            small
            onPress={async () => {
              await setEpisodeWatched(next.id, true)
              toast(`Visto S${next.season}E${next.episode}`)
            }}
            style={styles.cta}
          />
        )}
        {item.status === 'completed' && (
          <WatchedDate
            timestamp={item.completedAt}
            label="Completada"
            onChange={(ts) => updateItem(item.id, { completedAt: ts })}
          />
        )}
        {item.status === 'completed' && watched > 0 && (
          <Button
            title="Verla otra vez"
            small
            onPress={() => askRewatch(item.id, item.title)}
            style={styles.cta}
          />
        )}
        {/* Solo mientras no hayas marcado nada del visionado nuevo: así
            deshacer nunca puede llevarse progreso por delante. */}
        {item.status === 'rewatching' && watched === 0 && past.length > 0 && (
          <Button
            title="Deshacer «Verla otra vez»"
            small
            kind="ghost"
            onPress={async () => {
              if (await undoRewatch(item.id)) toast('Marcas recuperadas')
            }}
            style={styles.cta}
          />
        )}
      </DetailHead>

      <PastViewings past={past} />

      <MissingEpisodes itemId={item.id} localEpisodes={episodes} tmdb={tmdb} />

      {item.overview ? (
        <Txt variant="small" tone="muted">
          {item.overview}
        </Txt>
      ) : null}

      {tmdbId && <WhereToWatch data={tmdb?.providers} title={item.title} />}

      <CastRow cast={tmdb?.cast} />

      <DetailControls item={item} />

      <Txt variant="section">Episodios</Txt>
      {episodes.length === 0 ? (
        <Txt variant="small" tone="muted">
          No hay episodios cargados para esta serie.
        </Txt>
      ) : (
        <EpisodeList
          itemId={item.id}
          episodes={episodes}
          past={past}
          askMarkPrevious={item.askMarkPrevious !== false}
        />
      )}

      {/* Al final del todo: es lo menos importante de la ficha y no debe
          estorbar para llegar a los episodios, que es a lo que se entra. */}
      {tmdbId && (
        <SimilarTitles
          results={tmdb?.similar}
          kind="tv"
          originalLanguage={tmdb?.series.originalLanguage}
        />
      )}
    </ScrollView>
  )
}

/**
 * Avisa de que TMDB tiene episodios ya emitidos que tú no tienes guardados.
 *
 * Se compara con `last_episode_to_air`, que es el último que ha salido DE
 * VERDAD. Antes esto solo se descubría si te fijabas en que el contador no
 * cuadraba, o al entrar en «Próximos» cuando la fecha ya había pasado.
 */
function MissingEpisodes({
  itemId,
  localEpisodes,
  tmdb,
}: {
  itemId: string
  localEpisodes: Episode[]
  tmdb: TmdbSeriesFull | null | undefined
}) {
  const palette = usePalette()
  const toast = useToast()
  const [syncing, setSyncing] = useState(false)

  const last = tmdb?.series.lastEpisode
  if (!last) return null

  const have = localEpisodes.some((e) => e.season === last.season && e.episode === last.episode)
  if (have) return null

  const sync = async () => {
    setSyncing(true)
    try {
      const { added, failedSeasons } = await syncSeriesEpisodes(itemId)
      toast(
        added > 0
          ? `${added} episodio${added === 1 ? '' : 's'} nuevo${added === 1 ? '' : 's'}`
          : 'No hay nada nuevo en TMDB',
      )
      if (failedSeasons > 0) {
        toast(`${failedSeasons} temporada${failedSeasons === 1 ? '' : 's'} sin comprobar`)
      }
    } finally {
      setSyncing(false)
    }
  }

  return (
    <View style={[styles.banner, { borderColor: palette.line }]}>
      <Txt variant="small" tone="muted" style={{ flex: 1 }}>
        Ya ha salido S{last.season}E{last.episode} y no lo tienes en la lista.
      </Txt>
      <Button title={syncing ? '…' : 'Traer'} small onPress={sync} disabled={syncing} />
    </View>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cta: { alignSelf: 'flex-start', marginTop: space.xs },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.md,
  },
})
