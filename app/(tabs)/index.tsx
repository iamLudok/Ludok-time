import { useMemo, useState } from 'react'
import { FlatList, Pressable, View, StyleSheet, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { Screen, Empty } from '../../src/ui/Screen'
import { Txt } from '../../src/ui/Text'
import { Button } from '../../src/ui/Button'
import { Chips, type ChipOption } from '../../src/ui/Chips'

import { space } from '../../src/ui/theme'
import { PosterCard, countEpisodes } from '../../src/components/PosterCard'
import { ContinueWatching } from '../../src/components/ContinueWatching'
import { BackupBanner } from '../../src/components/BackupBanner'
import { FavouritePeople } from '../../src/components/FavouritePeople'
import { useLibraryItems, useAllEpisodes } from '../../src/hooks/useLibrary'
import type { MediaType, Status } from '../../src/types'

type TypeFilter = 'all' | MediaType
type StatusFilter = 'all' | Status
type SortBy = 'recent' | 'rating' | 'az'

const TYPES: readonly ChipOption<TypeFilter>[] = [
  { key: 'all', label: 'Todo' },
  { key: 'series', label: 'Series' },
  { key: 'movie', label: 'Pelis' },
  { key: 'book', label: 'Libros' },
  { key: 'manga', label: 'Manga' },
]

const STATUSES: readonly ChipOption<StatusFilter>[] = [
  { key: 'all', label: 'Todos' },
  { key: 'watching', label: 'Viendo' },
  { key: 'plan', label: 'Pendiente' },
  { key: 'completed', label: 'Completado' },
  { key: 'on_hold', label: 'En pausa' },
  { key: 'dropped', label: 'Abandonado' },
]

const SORT_LABEL: Record<SortBy, string> = {
  recent: 'Recientes',
  rating: 'Nota',
  az: 'A-Z',
}
const SORT_ORDER: SortBy[] = ['recent', 'rating', 'az']

const COLUMNS = 2

export default function LibraryScreen() {
  const router = useRouter()
  const { width } = useWindowDimensions()

  const [type, setType] = useState<TypeFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [sortBy, setSortBy] = useState<SortBy>('recent')

  const { data: items, ready } = useLibraryItems()
  const episodes = useAllEpisodes()

  const cardWidth = useMemo(
    () => (width - space.lg * 2 - space.md * (COLUMNS - 1)) / COLUMNS,
    [width],
  )

  const sorted = useMemo(() => {
    const filtered = items.filter(
      (i) => (type === 'all' || i.type === type) && (status === 'all' || i.status === status),
    )
    // Ya llegan por fecha de alta (reciente primero). No hay concepto de
    // favorito aparte: ordenar por nota ya distingue lo que más te gustó.
    return [...filtered].sort((a, b) => {
      if (sortBy === 'rating') return b.rating - a.rating || b.addedAt - a.addedAt
      if (sortBy === 'az') return a.title.localeCompare(b.title, 'es')
      return 0
    })
  }, [items, type, status, sortBy])

  const watchingSeries = items.filter((i) => i.type === 'series' && i.status === 'watching')
  // Se cuentan una sola vez para toda la rejilla, no una por tarjeta.
  const counts = useMemo(() => countEpisodes(episodes), [episodes])

  const cycleSort = () =>
    setSortBy((s) => SORT_ORDER[(SORT_ORDER.indexOf(s) + 1) % SORT_ORDER.length])

  return (
    <Screen
      title="Mi biblioteca"
      padded={false}
      right={
        <Pressable onPress={cycleSort} hitSlop={8} accessibilityRole="button">
          <Txt variant="label" tone="muted">
            {SORT_LABEL[sortBy]} ⇅
          </Txt>
        </Pressable>
      }
    >
      <FlatList
        data={sorted}
        keyExtractor={(i) => i.id}
        numColumns={COLUMNS}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <BackupBanner itemCount={items.length} />
            <ContinueWatching items={watchingSeries} episodes={episodes} />
            <FavouritePeople />
            <Chips options={TYPES} value={type} onChange={setType} />
            <Chips options={STATUSES} value={status} onChange={setStatus} />
            <Txt variant="data" tone="faint">
              {sorted.length}
              {sorted.length === 1 ? ' título' : ' títulos'}
            </Txt>
          </View>
        }
        ListEmptyComponent={
          // Mientras la consulta no ha respondido, «no hay nada» y «aún no lo
          // sé» son indistinguibles: no se anuncia una biblioteca vacía hasta
          // estar seguro.
          !ready ? null : (
            <Empty
              text={items.length === 0 ? 'Tu biblioteca está vacía.' : 'Nada con estos filtros.'}
            >
              {items.length === 0 && (
                <Button title="Añadir algo" kind="primary" onPress={() => router.push('/search')} />
              )}
            </Empty>
          )
        }
        renderItem={({ item }) => (
          <PosterCard item={item} count={counts.get(item.id)} width={cardWidth} />
        )}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.lg },
  column: { gap: space.md },
  header: { gap: space.sm, paddingTop: space.xs },
})
