import { useState } from 'react'
import { View, StyleSheet, Pressable, Alert } from 'react-native'
import { Image } from 'expo-image'
import {
  setEpisodeWatched,
  setEpisodeWatchedAt,
  markWatchedUpTo,
  setSeasonWatched,
  countPreviousUnwatched,
  stopAskingMarkPrevious,
  pastByEpisode,
} from '../lib/library'
import { WatchedDate, fmtDate } from './WatchedDate'
import { usePalette } from '../ui/ThemeProvider'
import { Txt } from '../ui/Text'
import { Button } from '../ui/Button'
import { Tick } from '../ui/Tick'
import { radius, space } from '../ui/theme'
import type { Episode, PastWatch } from '../types'

function groupBySeason(eps: Episode[]): [number, Episode[]][] {
  const map = new Map<number, Episode[]>()
  for (const e of eps) {
    if (!map.has(e.season)) map.set(e.season, [])
    map.get(e.season)!.push(e)
  }
  return [...map.entries()]
}

/**
 * Temporada abierta por defecto: la que tiene el próximo episodio pendiente (o
 * la última si ya está todo visto). Las demás empiezan plegadas: con One Piece
 * y sus 1.181 episodios esto es la diferencia entre 20 filas y 1.181.
 */
function initialOpenSeason(entries: [number, Episode[]][]): number | null {
  const withPending = entries.find(([, eps]) => eps.some((e) => !e.watched))
  if (withPending) return withPending[0]
  return entries.length ? entries[entries.length - 1][0] : null
}

export function EpisodeList({
  itemId,
  episodes,
  past = [],
  askMarkPrevious = true,
}: {
  itemId: string
  episodes: Episode[]
  /** Marcas de visionados anteriores, para enseñar cuándo viste cada uno antes. */
  past?: PastWatch[]
  /** false si en esta serie ya dijiste que no volvieras a preguntar. */
  askMarkPrevious?: boolean
}) {
  const palette = usePalette()
  const entries = groupBySeason(episodes)
  const before = pastByEpisode(past)

  /**
   * Al marcar un episodio suelto teniendo anteriores sin ver, ofrece marcarlos
   * también: lo normal es que los hayas visto y no los apuntaras, no que te
   * hayas saltado diez capítulos.
   */
  const markOne = async (episode: Episode) => {
    if (episode.watched) {
      await setEpisodeWatched(episode.id, false)
      return
    }

    const pending = countPreviousUnwatched(episodes, episode.id)
    if (!askMarkPrevious || pending === 0) {
      await setEpisodeWatched(episode.id, true)
      return
    }

    Alert.alert(
      '¿Marcar también los anteriores?',
      `Quedan ${pending} episodio${pending === 1 ? '' : 's'} sin marcar antes de este.`,
      [
        {
          text: 'Sí, marcarlos',
          onPress: () => markWatchedUpTo(itemId, episode.id),
        },
        {
          text: 'No, solo este',
          onPress: () => setEpisodeWatched(episode.id, true),
        },
        {
          text: 'No preguntar en esta serie',
          onPress: async () => {
            await setEpisodeWatched(episode.id, true)
            await stopAskingMarkPrevious(itemId)
          },
        },
      ],
    )
  }

  const [open, setOpen] = useState<Set<number>>(() => {
    const initial = initialOpenSeason(entries)
    return new Set(initial === null ? [] : [initial])
  })

  const toggleOpen = (season: number) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(season)) next.delete(season)
      else next.add(season)
      return next
    })

  return (
    <View>
      {entries.map(([season, seasonEps]) => {
        const watched = seasonEps.filter((e) => e.watched).length
        const allWatched = watched === seasonEps.length
        const isOpen = open.has(season)

        return (
          <View key={season}>
            <View style={[styles.seasonHead, { borderColor: palette.line }]}>
              <Pressable
                onPress={() => toggleOpen(season)}
                style={styles.seasonTap}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
              >
                <Txt variant="small" tone="muted" style={styles.chevron}>
                  {isOpen ? '▾' : '▸'}
                </Txt>
                <Txt variant="section">Temporada {season}</Txt>
                <Txt variant="data" tone="faint">
                  {watched}/{seasonEps.length}
                </Txt>
              </Pressable>
              <Button
                title={allWatched ? 'Desmarcar' : 'Marcar toda'}
                small
                onPress={() => setSeasonWatched(itemId, seasonEps, !allWatched)}
              />
            </View>

            {isOpen &&
              seasonEps.map((e) => (
                <View key={e.id} style={[styles.ep, { borderColor: palette.line }]}>
                  {e.still ? (
                    <Image
                      source={{ uri: e.still }}
                      style={[styles.still, { backgroundColor: palette.surface2 }]}
                      contentFit="cover"
                      transition={120}
                      cachePolicy="disk"
                    />
                  ) : (
                    <View style={[styles.still, { backgroundColor: palette.surface2 }]} />
                  )}

                  <View style={styles.main}>
                    <Txt variant="small" numberOfLines={2} style={styles.epTitle}>
                      {e.episode}. {e.title || `Episodio ${e.episode}`}
                    </Txt>
                    {e.airDate && (
                      <Txt variant="data" tone="faint">
                        {e.airDate}
                      </Txt>
                    )}
                    {e.watched ? (
                      <WatchedDate
                        timestamp={e.watchedAt}
                        onChange={(ts) => setEpisodeWatchedAt(e.id, ts)}
                      />
                    ) : (
                      <Pressable onPress={() => markWatchedUpTo(itemId, e.id)} hitSlop={4}>
                        <Txt variant="small" tone="faint">
                          marcar hasta aquí
                        </Txt>
                      </Pressable>
                    )}
                    {before.has(e.id) && (
                      <Txt variant="data" tone="faint">
                        Antes:{' '}
                        {before
                          .get(e.id)!
                          .map((w) => (w.watchedAt ? fmtDate(w.watchedAt) : 'sin fecha'))
                          .join(', ')}
                      </Txt>
                    )}
                  </View>

                  <Tick on={e.watched} onPress={() => markOne(e)} />
                </View>
              ))}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  seasonHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  seasonTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chevron: { width: 12 },
  ep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  still: { width: 84, aspectRatio: 16 / 9, borderRadius: radius.sm },
  main: { flex: 1, minWidth: 0, gap: 2 },
  epTitle: { fontWeight: '600' },
})
