import { useEffect, useState } from 'react'
import { View, ScrollView, StyleSheet, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useLiveQuery } from 'drizzle-orm/expo-sqlite'
import { eq } from 'drizzle-orm'
import { db } from '../lib/db'
import { items as itemsTable } from '../lib/schema'
import { getSimilar, posterUrl, type TmdbSimilar } from '../lib/tmdb'
import { addMovieFromTmdb, addSeriesFromTmdb } from '../lib/library'
import { Poster } from '../ui/Poster'
import { Txt } from '../ui/Text'
import { usePalette } from '../ui/ThemeProvider'
import { useToast } from '../ui/Toast'
import { radius, space } from '../ui/theme'

const CARD_WIDTH = 92

/**
 * «También te puede gustar»: parecidos por género/temática (consulta en vivo a
 * TMDB, no se guarda). Se filtran por idioma original porque el `similar` de
 * TMDB mezcla orígenes: sin ese filtro, un anime japonés acaba recomendando
 * series occidentales solo por compartir género. Se excluye lo que ya tienes.
 */
export function SimilarTitles({
  tmdbId,
  kind,
  originalLanguage,
}: {
  tmdbId: number
  kind: 'movie' | 'tv'
  originalLanguage?: string
}) {
  const router = useRouter()
  const palette = usePalette()
  const toast = useToast()
  const [results, setResults] = useState<TmdbSimilar[] | null>(null)
  const [addingId, setAddingId] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    setResults(null)
    getSimilar(tmdbId, kind)
      .then((r) => alive && setResults(r))
      .catch(() => alive && setResults([]))
    return () => {
      alive = false
    }
  }, [tmdbId, kind])

  // Aquí `source` sí es una columna indexable, así que se filtra en la consulta
  // (en Dexie había que traerse todo y filtrar en JavaScript).
  const { data: mine } = useLiveQuery(
    db.select({ sourceId: itemsTable.sourceId }).from(itemsTable).where(eq(itemsTable.source, 'tmdb')),
  )
  const existing = new Set((mine ?? []).map((i) => i.sourceId))

  if (!results || results.length === 0) return null

  const byLanguage = originalLanguage
    ? results.filter((r) => r.originalLanguage === originalLanguage)
    : results
  const filtered = byLanguage.filter((r) => !existing.has(String(r.id))).slice(0, 12)
  if (filtered.length === 0) return null

  const add = async (r: TmdbSimilar) => {
    setAddingId(r.id)
    try {
      if (kind === 'movie') {
        await addMovieFromTmdb(r.id, 'movie', 'plan')
      } else {
        const { failedSeasons } = await addSeriesFromTmdb(r.id, 'plan')
        if (failedSeasons > 0) {
          toast(`${failedSeasons} temporada${failedSeasons === 1 ? '' : 's'} no se pudo cargar`)
        }
      }
      toast(`Añadido: ${r.title}`)
    } catch {
      toast('No se pudo añadir')
    } finally {
      setAddingId(null)
    }
  }

  return (
    <View style={styles.wrap}>
      <Txt variant="section">También te puede gustar</Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {filtered.map((r) => (
          <View key={r.id} style={{ width: CARD_WIDTH }}>
            <Pressable
              onPress={() => router.push(`/preview/${kind}/${r.id}`)}
              style={({ pressed }) => [{ opacity: pressed ? 0.65 : 1 }]}
            >
              <Poster
                uri={r.posterPath ? posterUrl(r.posterPath, 'w185') : undefined}
                type={kind === 'movie' ? 'movie' : 'series'}
                title={r.title}
                width={CARD_WIDTH}
              />
            </Pressable>
            <Pressable
              onPress={() => add(r)}
              disabled={addingId === r.id}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Añadir ${r.title}`}
              style={[styles.add, { backgroundColor: palette.fg }]}
            >
              <Txt style={{ color: palette.onFg, fontSize: 15, lineHeight: 18, fontWeight: '700' }}>
                {addingId === r.id ? '·' : '+'}
              </Txt>
            </Pressable>
            <Txt variant="small" tone="muted" numberOfLines={2} style={styles.title}>
              {r.title}
            </Txt>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: { gap: space.md, paddingRight: space.lg },
  add: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { paddingTop: space.xs },
})
