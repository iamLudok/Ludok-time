import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, View, StyleSheet, Pressable, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { Screen, Empty } from '../../src/ui/Screen'
import { Txt } from '../../src/ui/Text'
import { Button } from '../../src/ui/Button'
import { Poster } from '../../src/ui/Poster'
import { usePalette } from '../../src/ui/ThemeProvider'
import { useToast } from '../../src/ui/Toast'
import { space } from '../../src/ui/theme'
import { useLibraryItems } from '../../src/hooks/useLibrary'
import { useSettingsQuery } from '../../src/hooks/useSettings'
import {
  followedSeries,
  fetchUpcoming,
  cachedUpcoming,
  invalidateUpcoming,
  fetchUpcomingReleases,
  cachedReleases,
  invalidateReleases,
  whenLabel,
  type Upcoming,
  type UpcomingRelease,
} from '../../src/lib/upcoming'
import { syncSeriesEpisodes } from '../../src/lib/library'
import { useFavourites } from '../../src/hooks/usePeople'
import { posterUrl } from '../../src/lib/tmdb'

const POSTER = 56

/**
 * Cuándo sale el próximo capítulo de cada serie que sigues, todas juntas.
 *
 * Antes esto vivía dentro de la ficha de cada serie, lo que obligaba a entrar
 * una por una para enterarte. Aquí se ve de un vistazo y ordenado por lo que
 * sale antes.
 */
export default function UpcomingScreen() {
  const router = useRouter()
  const palette = usePalette()
  const toast = useToast()
  const { data: items, ready } = useLibraryItems()
  const { data: settings, ready: settingsReady } = useSettingsQuery()

  const [rows, setRows] = useState<Upcoming[] | null>(null)
  const [releases, setReleases] = useState<UpcomingRelease[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null)

  const series = useMemo(() => followedSeries(items), [items])
  const { data: favourites } = useFavourites()
  const peopleKey = favourites.map((p) => p.tmdbId).join(',')
  // La lista de ids es lo que de verdad decide si hay que volver a preguntar:
  // sin esto, cualquier cambio en la biblioteca relanzaría todas las peticiones.
  const key = series.map((s) => s.id).join(',')

  const load = useCallback(async (force = false) => {
    if (!series.length) {
      setRows([])
      return
    }
    if (force) invalidateUpcoming()
    else {
      const hit = cachedUpcoming(series)
      if (hit) {
        setRows(hit)
        return
      }
    }
    setRows(await fetchUpcoming(series))
    // `key` identifica la lista de series; `series` cambia de identidad en cada
    // render aunque su contenido sea el mismo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const loadReleases = useCallback(async (force = false) => {
    if (!favourites.length) {
      setReleases([])
      return
    }
    if (force) invalidateReleases()
    else {
      const hit = cachedReleases(favourites)
      if (hit) {
        setReleases(hit)
        return
      }
    }
    setReleases(await fetchUpcomingReleases(favourites))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleKey])

  useEffect(() => {
    if (!ready || !settingsReady || !settings.tmdbApiKey) return
    load().catch(() => setRows([]))
    loadReleases().catch(() => setReleases([]))
  }, [ready, settingsReady, settings.tmdbApiKey, load, loadReleases])

  const refresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([load(true), loadReleases(true)])
    } finally {
      setRefreshing(false)
    }
  }

  /** Para cuando la fecha ya pasó: trae el capítulo si TMDB ya lo publicó. */
  const bring = async (row: Upcoming) => {
    setSyncing(row.item.id)
    try {
      const { added } = await syncSeriesEpisodes(row.item.id)
      toast(added > 0 ? `${added} episodio${added === 1 ? '' : 's'} nuevo${added === 1 ? '' : 's'}` : 'Aún no está en TMDB')
      if (added > 0) await load(true)
    } finally {
      setSyncing(null)
    }
  }

  if (settingsReady && !settings.tmdbApiKey) {
    return (
      <Screen title="Próximos">
        <Empty text="Necesitas la API key de TMDB para saber cuándo salen los episodios.">
          <Button title="Ir a Ajustes" kind="primary" onPress={() => router.push('/settings')} />
        </Empty>
      </Screen>
    )
  }

  if (rows === null) {
    return (
      <Screen title="Próximos">
        <View style={styles.center}>
          <ActivityIndicator color={palette.muted} />
        </View>
      </Screen>
    )
  }

  return (
    <Screen title="Próximos" padded={false}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.item.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.muted} />
        }
        ListEmptyComponent={
          // Si sigues a actores, la sección de estrenos ya llena la pantalla y
          // un cartel de «no hay nada» encima quedaría fuera de lugar.
          favourites.length > 0 ? null : (
            <Empty
              text={
                series.length === 0
                  ? 'Aquí saldrán los próximos capítulos de las series que sigas.'
                  : 'Ninguna de tus series tiene episodio anunciado ahora mismo.'
              }
            />
          )
        }
        ListHeaderComponent={
          rows.length > 0 ? (
            <Txt variant="label" tone="muted" style={styles.section}>
              Episodios
            </Txt>
          ) : null
        }
        ListFooterComponent={
          <>
            {rows.length > 0 ? (
              <Txt variant="small" tone="faint" style={styles.footer}>
                Fechas de TMDB. Desliza hacia abajo para volver a comprobar.
              </Txt>
            ) : null}
            <Releases rows={releases} hasFavourites={favourites.length > 0} />
          </>
        }
        renderItem={({ item: row }) => {
          const late = row.days !== null && row.days < 0
          return (
            <View style={[styles.row, { borderColor: palette.line }]}>
              <Pressable
                onPress={() => router.push(`/series/${row.item.id}`)}
                style={styles.tap}
                accessibilityRole="button"
              >
                <Poster
                  uri={row.item.poster}
                  type="series"
                  title={row.item.title}
                  width={POSTER}
                />
                <View style={styles.main}>
                  <Txt variant="section" numberOfLines={1}>
                    {row.item.title}
                  </Txt>
                  <Txt variant="small" tone="muted" numberOfLines={2}>
                    S{row.next.season}E{row.next.episode}
                    {row.next.title ? ` · ${row.next.title}` : ''}
                  </Txt>
                  <Txt variant="data" tone={late ? 'warn' : 'fg'}>
                    {whenLabel(row.days)}
                    {row.next.airDate ? ` · ${row.next.airDate}` : ''}
                  </Txt>
                </View>
              </Pressable>
              {late && (
                <Button
                  title={syncing === row.item.id ? '…' : 'Traer'}
                  small
                  onPress={() => bring(row)}
                  disabled={syncing !== null}
                />
              )}
            </View>
          )
        }}
      />
    </Screen>
  )
}

/**
 * Lo que estrenan tus actores favoritos, debajo de los episodios.
 *
 * Va en el mismo scroll y no en otra pestaña: son pocas filas — un actor suele
 * tener uno o dos proyectos anunciados — y partirlo obligaría a tocar para ver
 * media pantalla vacía.
 */
function Releases({ rows, hasFavourites }: { rows: UpcomingRelease[]; hasFavourites: boolean }) {
  const router = useRouter()
  const palette = usePalette()

  if (!hasFavourites) return null

  return (
    <View style={styles.releases}>
      <Txt variant="label" tone="muted">
        Estrenos de tus actores
      </Txt>
      {rows.length === 0 ? (
        <Txt variant="small" tone="faint">
          Ninguno tiene nada anunciado ahora mismo.
        </Txt>
      ) : (
        rows.map((row) => (
          <Pressable
            key={`${row.credit.mediaType}-${row.credit.id}`}
            onPress={() =>
              router.push(`/preview/${row.credit.mediaType === 'tv' ? 'tv' : 'movie'}/${row.credit.id}`)
            }
            style={({ pressed }) => [
              styles.row,
              { borderColor: palette.line, opacity: pressed ? 0.65 : 1 },
            ]}
          >
            <Poster
              uri={row.credit.posterPath ? posterUrl(row.credit.posterPath, 'w185') : undefined}
              type={row.credit.mediaType === 'tv' ? 'series' : 'movie'}
              title={row.credit.title}
              width={POSTER}
            />
            <View style={styles.main}>
              <Txt variant="section" numberOfLines={2}>
                {row.credit.title}
              </Txt>
              <Txt variant="small" tone="muted" numberOfLines={1}>
                {row.names.join(', ')}
              </Txt>
              <Txt variant="data" tone="fg">
                {whenLabel(row.days)}
                {row.credit.date ? ` · ${row.credit.date}` : ''}
              </Txt>
            </View>
          </Pressable>
        ))
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minWidth: 0 },
  main: { flex: 1, minWidth: 0, gap: 2 },
  footer: { paddingTop: space.lg },
  section: { paddingBottom: space.sm },
  releases: { paddingTop: space.xl, gap: space.sm },
})
