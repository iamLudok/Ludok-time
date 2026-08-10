import { useEffect, useState } from 'react'
import { ScrollView, View, StyleSheet, ActivityIndicator } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useItem, useEpisodes } from '../../src/hooks/useLibrary'
import {
  setEpisodeWatched,
  updateItem,
  backfillEpisodeStills,
  syncSeriesEpisodes,
} from '../../src/lib/library'
import { getSeries, type TmdbSeries } from '../../src/lib/tmdb'
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
import type { Episode } from '../../src/types'

export default function SeriesDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const palette = usePalette()
  const toast = useToast()
  const item = useItem(id)
  const episodes = useEpisodes(id)

  const tmdbId = item?.source === 'tmdb' && item.sourceId ? Number(item.sourceId) : undefined
  // Un solo fetch a TMDB, compartido por el aviso de próximo episodio y por
  // «También te puede gustar» (en la web cada uno pedía lo suyo).
  const [tmdb, setTmdb] = useState<TmdbSeries | null | undefined>(undefined)

  useEffect(() => {
    if (!tmdbId) {
      setTmdb(null)
      return
    }
    let alive = true
    setTmdb(undefined)
    getSeries(tmdbId)
      .then((s) => alive && setTmdb(s))
      .catch(() => alive && setTmdb(null))
    return () => {
      alive = false
    }
  }, [tmdbId])

  // Series añadidas antes de que existieran las fotos de episodio no las tienen
  // guardadas: se rellenan una vez al entrar, sin tocar lo visto.
  useEffect(() => {
    if (id && tmdbId) backfillEpisodeStills(id).catch(() => {})
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
        meta={`${item.year ?? ''} · ${watched}/${episodes.length} episodios`}
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
      </DetailHead>

      <NextEpisode itemId={item.id} localEpisodes={episodes} series={tmdb} />

      {item.overview ? (
        <Txt variant="small" tone="muted">
          {item.overview}
        </Txt>
      ) : null}

      {tmdbId && <WhereToWatch tmdbId={tmdbId} kind="tv" title={item.title} />}

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
          askMarkPrevious={item.askMarkPrevious !== false}
        />
      )}

      {/* Al final del todo: es lo menos importante de la ficha y no debe
          estorbar para llegar a los episodios, que es a lo que se entra. */}
      {tmdbId && (
        <SimilarTitles tmdbId={tmdbId} kind="tv" originalLanguage={tmdb?.originalLanguage} />
      )}
    </ScrollView>
  )
}

/**
 * Aviso del próximo episodio. Muestra SIEMPRE algún estado en series en emisión
 * — incluido «sin fecha anunciada» — para que quede claro que la app lo ha
 * comprobado y no que algo esté roto.
 */
function NextEpisode({
  itemId,
  localEpisodes,
  series,
}: {
  itemId: string
  localEpisodes: Episode[]
  series: TmdbSeries | null | undefined
}) {
  const palette = usePalette()
  const toast = useToast()
  const [syncing, setSyncing] = useState(false)

  if (!series) return null
  if (series.inProduction === false) return null

  const next = series.nextEpisode
  const haveLocally =
    !!next && localEpisodes.some((e) => e.season === next.season && e.episode === next.episode)
  // Ya lo tenemos: lo gestiona el botón «Ver siguiente».
  if (haveLocally) return null

  const sync = async () => {
    setSyncing(true)
    try {
      const { added, failedSeasons } = await syncSeriesEpisodes(itemId)
      toast(
        added > 0
          ? `${added} episodio${added === 1 ? '' : 's'} nuevo${added === 1 ? '' : 's'}`
          : 'Aún no aparece en TMDB',
      )
      if (failedSeasons > 0) {
        toast(`${failedSeasons} temporada${failedSeasons === 1 ? '' : 's'} sin comprobar`)
      }
    } finally {
      setSyncing(false)
    }
  }

  if (!next?.airDate) {
    return (
      <View style={[styles.banner, { borderColor: palette.line }]}>
        <Txt variant="small" tone="muted">
          Sin fecha anunciada todavía para el próximo episodio.
        </Txt>
      </View>
    )
  }

  const target = new Date(next.airDate + 'T00:00').getTime()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((target - today.getTime()) / 86_400_000)
  const label = `S${next.season}E${next.episode}${next.title ? ' · ' + next.title : ''}`

  return (
    <View style={[styles.banner, { borderColor: palette.line }]}>
      <Txt variant="small" tone="muted" style={{ flex: 1 }}>
        {days > 1 && `Próximo: ${label} · en ${days} días`}
        {days === 1 && `Próximo: ${label} · mañana`}
        {days === 0 && `Próximo: ${label} · ¡hoy!`}
        {days < 0 && `${label} ya debería estar disponible`}
      </Txt>
      {days <= 0 && (
        <Button title={syncing ? '…' : 'Actualizar'} small onPress={sync} disabled={syncing} />
      )}
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
