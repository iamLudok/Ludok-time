import { useEffect, useState } from 'react'
import {
  View,
  ScrollView,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Screen } from '../../src/ui/Screen'
import { Txt } from '../../src/ui/Text'
import { Button } from '../../src/ui/Button'
import { Chips, type ChipOption } from '../../src/ui/Chips'
import { Poster } from '../../src/ui/Poster'
import { usePalette } from '../../src/ui/ThemeProvider'
import { useToast } from '../../src/ui/Toast'
import { radius, space } from '../../src/ui/theme'
import { useSettings, useSettingsQuery } from '../../src/hooks/useSettings'
import { useDebounced } from '../../src/hooks/useDebounced'
import { searchMulti, discover, posterUrl, type TmdbSearchResult } from '../../src/lib/tmdb'
import { searchBooks, type BookResult } from '../../src/lib/openlibrary'
import { addManualBook, addManualManga } from '../../src/lib/library'
import { searchManga, statusLabel as mangaStatus, type MangaResult } from '../../src/lib/mangadex'
import { setMangaPreview } from '../../src/lib/mangaPreview'
import { setBookPreview } from '../../src/lib/bookPreview'

type Tab = 'screen' | 'books' | 'manga'

const TABS: readonly ChipOption<Tab>[] = [
  { key: 'screen', label: 'Series y pelis' },
  { key: 'books', label: 'Libros' },
  { key: 'manga', label: 'Manga' },
]

export default function SearchScreen() {
  const [tab, setTab] = useState<Tab>('screen')
  return (
    <Screen title="Añadir" padded={false}>
      <View style={styles.tabs}>
        <Chips options={TABS} value={tab} onChange={setTab} />
      </View>
      {tab === 'screen' && <ScreenSearch />}
      {tab === 'books' && <BookSearch />}
      {tab === 'manga' && <MangaSearch />}
    </Screen>
  )
}

/**
 * Campo de búsqueda, compartido por las tres pestañas.
 *
 * Busca solo mientras escribes (con retardo), así que no lleva botón de buscar:
 * en su sitio va el indicador de que está buscando, y una «✕» para vaciar sin
 * tener que borrar letra a letra.
 */
function SearchField({
  value,
  onChange,
  onSubmit,
  placeholder,
  loading,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  placeholder: string
  loading: boolean
}) {
  const palette = usePalette()
  return (
    <View
      style={[
        styles.field,
        { borderColor: palette.line, backgroundColor: palette.surface },
      ]}
    >
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={palette.faint}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.fieldInput, { color: palette.fg }]}
      />
      {loading ? (
        <ActivityIndicator size="small" color={palette.muted} style={styles.fieldIcon} />
      ) : value.length > 0 ? (
        <Pressable
          onPress={() => onChange('')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Borrar la búsqueda"
          style={styles.fieldIcon}
        >
          <Txt variant="body" tone="muted">
            ✕
          </Txt>
        </Pressable>
      ) : null}
    </View>
  )
}

/* --- Series y películas (TMDB) -------------------------------------------- */

interface Category {
  key: string
  label: string
  movieGenres?: number[]
  tvGenres?: number[]
}

// Los géneros de película y de serie de TMDB son dos listas distintas que solo
// coinciden a medias (p. ej. "Acción" no existe en series, que en su lugar
// tiene "Action & Adventure"): cada categoría junta el/los id(s) de cada lado
// que mejor encajan, y si un lado no tiene equivalente se deja sin pedir.
const CATEGORIES: readonly Category[] = [
  { key: 'accion', label: 'Acción y aventura', movieGenres: [28, 12], tvGenres: [10759] },
  { key: 'animacion', label: 'Animación', movieGenres: [16], tvGenres: [16] },
  { key: 'comedia', label: 'Comedia', movieGenres: [35], tvGenres: [35] },
  { key: 'crimen', label: 'Crimen', movieGenres: [80], tvGenres: [80] },
  { key: 'documental', label: 'Documental', movieGenres: [99], tvGenres: [99] },
  { key: 'drama', label: 'Drama', movieGenres: [18], tvGenres: [18] },
  { key: 'familia', label: 'Familia', movieGenres: [10751], tvGenres: [10751] },
  { key: 'fantasia', label: 'Fantasía y ciencia ficción', movieGenres: [14, 878], tvGenres: [10765] },
  { key: 'misterio', label: 'Misterio', movieGenres: [9648], tvGenres: [9648] },
  { key: 'romance', label: 'Romance', movieGenres: [10749] },
  { key: 'terror', label: 'Terror y suspense', movieGenres: [27, 53] },
  { key: 'belica', label: 'Bélica e histórica', movieGenres: [10752, 36], tvGenres: [10768] },
  { key: 'western', label: 'Western', movieGenres: [37], tvGenres: [37] },
]

type CategoryKey = (typeof CATEGORIES)[number]['key']

const CATEGORY_CHIPS: readonly ChipOption<CategoryKey>[] = CATEGORIES.map((c) => ({
  key: c.key,
  label: c.label,
}))

/** Une los resultados de película y serie de una categoría alternando entre
 * ambos, para no enseñar primero 20 películas y luego 20 series. */
function interleave(a: TmdbSearchResult[], b: TmdbSearchResult[]): TmdbSearchResult[] {
  const out: TmdbSearchResult[] = []
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) {
    if (a[i]) out.push(a[i])
    if (b[i]) out.push(b[i])
  }
  return out
}

function ScreenSearch() {
  const router = useRouter()
  const palette = usePalette()
  const { data: settings, ready } = useSettingsQuery()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TmdbSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const debounced = useDebounced(query)

  const [category, setCategory] = useState<CategoryKey>(CATEGORIES[0].key)
  const [catResults, setCatResults] = useState<TmdbSearchResult[]>([])
  const [catLoading, setCatLoading] = useState(false)
  const [catError, setCatError] = useState('')

  // Sin texto siempre hay una categoría elegida (no existe «Todo»), así que
  // se navega por géneros nada más entrar en vez de enseñar la pantalla vacía.
  const browsing = !debounced.trim()

  useEffect(() => {
    const text = debounced.trim()
    if (!text) {
      setResults([])
      setError('')
      setLoading(false)
      return
    }

    // `alive` descarta la respuesta si para cuando llega ya has seguido
    // escribiendo: sin esto, una petición lenta de hace tres letras podría
    // pisar los resultados de la búsqueda actual.
    let alive = true
    setLoading(true)
    setError('')
    searchMulti(text)
      .then((r) => {
        if (!alive) return
        setResults(r)
      })
      .catch((e: unknown) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'Error al buscar')
        setResults([])
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [debounced])

  useEffect(() => {
    if (!browsing) {
      setCatResults([])
      setCatError('')
      setCatLoading(false)
      return
    }
    const cat = CATEGORIES.find((c) => c.key === category)
    if (!cat) return

    let alive = true
    setCatLoading(true)
    setCatError('')
    Promise.all([
      cat.movieGenres ? discover('movie', cat.movieGenres) : Promise.resolve([]),
      cat.tvGenres ? discover('tv', cat.tvGenres) : Promise.resolve([]),
    ])
      .then(([movies, series]) => {
        if (!alive) return
        setCatResults(interleave(movies, series))
      })
      .catch((e: unknown) => {
        if (!alive) return
        setCatError(e instanceof Error ? e.message : 'Error al buscar')
        setCatResults([])
      })
      .finally(() => {
        if (alive) setCatLoading(false)
      })
    return () => {
      alive = false
    }
  }, [browsing, category])

  // Mientras no se sepa si hay API key, no se dice que falta.
  if (ready && !settings.tmdbApiKey) {
    return (
      <View style={styles.pad}>
        <Txt variant="small" tone="muted">
          Para buscar series y películas necesitas una API key gratuita de TMDB.
        </Txt>
        <Button
          title="Configurar en Ajustes"
          kind="primary"
          onPress={() => router.push('/settings')}
        />
      </View>
    )
  }

  const shown = browsing ? catResults : results
  const shownLoading = browsing ? catLoading : loading
  const shownError = browsing ? catError : error

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <SearchField
        value={query}
        onChange={setQuery}
        onSubmit={() => {}}
        placeholder="Buscar serie o película…"
        loading={loading}
      />
      {!debounced.trim() && (
        <View style={styles.categoryRow}>
          <Chips options={CATEGORY_CHIPS} value={category} onChange={setCategory} />
        </View>
      )}
      {shownError ? (
        <Txt variant="small" tone="danger">
          {shownError}
        </Txt>
      ) : null}
      {!shownLoading && !shownError && debounced.trim() && shown.length === 0 ? (
        <Txt variant="small" tone="muted">
          Nada encontrado.
        </Txt>
      ) : null}
      {!shownLoading && !shownError && browsing && shown.length === 0 ? (
        <Txt variant="small" tone="muted">
          Nada encontrado en esta categoría.
        </Txt>
      ) : null}
      {shownLoading && shown.length === 0 ? (
        <ActivityIndicator color={palette.muted} style={styles.pad} />
      ) : null}
      {shown.map((r) => (
        <Pressable
          key={`${r.mediaType}-${r.id}`}
          onPress={() => router.push(`/preview/${r.mediaType}/${r.id}`)}
          style={({ pressed }) => [
            styles.result,
            { borderColor: palette.line, opacity: pressed ? 0.65 : 1 },
          ]}
        >
          <Poster
            uri={r.posterPath ? posterUrl(r.posterPath, 'w185') : undefined}
            type={r.mediaType === 'tv' ? 'series' : 'movie'}
            title={r.title}
            width={54}
          />
          <View style={styles.resultMain}>
            <Txt variant="section" numberOfLines={2}>
              {r.title}
            </Txt>
            <Txt variant="data" tone="faint">
              {r.mediaType === 'tv' ? 'Serie' : 'Película'}
              {r.year ? ` · ${r.year}` : ''}
            </Txt>
            {r.overview ? (
              <Txt variant="small" tone="muted" numberOfLines={2}>
                {r.overview}
              </Txt>
            ) : null}
          </View>
        </Pressable>
      ))}
    </ScrollView>
  )
}

/* --- Libros (Open Library + a mano) ----------------------------------------- */

const SOURCE_LABEL: Record<BookResult['source'], string> = {
  openlibrary: 'Open Library',
}

function BookSearch() {
  const router = useRouter()
  const palette = usePalette()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BookResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [pages, setPages] = useState('')

  const debounced = useDebounced(query)

  useEffect(() => {
    const text = debounced.trim()
    if (!text) {
      setResults([])
      setError('')
      setLoading(false)
      return
    }

    let alive = true
    setLoading(true)
    setError('')
    searchBooks(text)
      .then((r) => alive && setResults(r))
      .catch((e: unknown) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'No se pudo buscar. Prueba a apuntarlo a mano abajo.')
        setResults([])
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [debounced])

  const addManual = async () => {
    if (!title.trim()) return
    const id = await addManualBook({
      title: title.trim(),
      author: author.trim() || undefined,
      pages: pages ? parseInt(pages, 10) : undefined,
    })
    toast('Añadido')
    setTitle('')
    setAuthor('')
    setPages('')
    router.push(`/book/${id}`)
  }

  const field = [
    styles.input,
    { borderColor: palette.line, color: palette.fg, backgroundColor: palette.surface },
  ]

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <SearchField
        value={query}
        onChange={setQuery}
        onSubmit={() => {}}
        placeholder="Buscar libro por título o autor…"
        loading={loading}
      />
      <Txt variant="small" tone="faint">
        Open Library
      </Txt>
      {error ? (
        <Txt variant="small" tone="danger">
          {error}
        </Txt>
      ) : null}

      {results.map((b) => (
        <Pressable
          key={`${b.source}-${b.key}`}
          onPress={() => {
            // Estas fuentes no tienen endpoint de detalle: la vista previa
            // reutiliza lo que ya trajo la búsqueda, pasado en memoria.
            setBookPreview(b)
            router.push('/preview/book')
          }}
          style={({ pressed }) => [
            styles.result,
            { borderColor: palette.line, opacity: pressed ? 0.65 : 1 },
          ]}
        >
          <Poster uri={b.cover || undefined} type="book" title={b.title} width={54} />
          <View style={styles.resultMain}>
            <Txt variant="section" numberOfLines={2}>
              {b.title}
            </Txt>
            <Txt variant="data" tone="faint">
              {SOURCE_LABEL[b.source]}
              {b.year ? ` · ${b.year}` : ''}
            </Txt>
            <Txt variant="small" tone="muted" numberOfLines={1}>
              {b.author ?? 'Autor desconocido'}
              {b.pages ? ` · ${b.pages} págs.` : ''}
            </Txt>
          </View>
        </Pressable>
      ))}

      <View style={[styles.card, { borderColor: palette.line }]}>
        <Txt variant="section">¿No aparece? Apúntalo a mano</Txt>
        <Txt variant="small" tone="muted">
          Útil para manga, ediciones raras o cualquier libro que no encuentres arriba.
        </Txt>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Título"
          placeholderTextColor={palette.faint}
          style={field}
        />
        <TextInput
          value={author}
          onChangeText={setAuthor}
          placeholder="Autor (opcional)"
          placeholderTextColor={palette.faint}
          style={field}
        />
        <TextInput
          value={pages}
          onChangeText={setPages}
          placeholder="Páginas totales (opcional)"
          placeholderTextColor={palette.faint}
          keyboardType="number-pad"
          style={field}
        />
        <Button title="Apuntar libro" kind="primary" onPress={addManual} disabled={!title.trim()} />
      </View>
    </ScrollView>
  )
}

/* --- Manga (MangaDex + a mano) --------------------------------------------- */

function MangaSearch() {
  const router = useRouter()
  const palette = usePalette()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MangaResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [chapters, setChapters] = useState('')
  const debounced = useDebounced(query)

  useEffect(() => {
    const text = debounced.trim()
    if (!text) {
      setResults([])
      setError('')
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    setError('')
    searchManga(text)
      .then((r) => alive && setResults(r))
      .catch((e: unknown) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'Error al buscar')
        setResults([])
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [debounced])

  const addManual = async () => {
    if (!title.trim()) return
    const id = await addManualManga({
      title: title.trim(),
      author: author.trim() || undefined,
      chapters: chapters ? parseInt(chapters, 10) : undefined,
    })
    toast('Añadido')
    setTitle('')
    setAuthor('')
    setChapters('')
    router.push(`/manga/${id}`)
  }

  const field = [
    styles.input,
    { borderColor: palette.line, color: palette.fg, backgroundColor: palette.surface },
  ]

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <SearchField
        value={query}
        onChange={setQuery}
        onSubmit={() => {}}
        placeholder="Buscar manga…"
        loading={loading}
      />
      <Txt variant="small" tone="faint">
        MangaDex · el enlace para leerlo se busca en inManga al añadirlo
      </Txt>
      {error ? (
        <Txt variant="small" tone="danger">
          {error}
        </Txt>
      ) : null}

      {results.map((m) => (
        <Pressable
          key={m.key}
          onPress={() => {
            setMangaPreview(m)
            router.push('/preview/manga')
          }}
          style={({ pressed }) => [
            styles.result,
            { borderColor: palette.line, opacity: pressed ? 0.65 : 1 },
          ]}
        >
          <Poster uri={m.cover} type="manga" title={m.title} width={54} />
          <View style={styles.resultMain}>
            <Txt variant="section" numberOfLines={2}>
              {m.title}
            </Txt>
            <Txt variant="data" tone="faint">
              {[mangaStatus(m.status), m.year, m.lastChapter ? `${m.lastChapter} caps.` : null]
                .filter(Boolean)
                .join(" · ")}
            </Txt>
            <Txt variant="small" tone="muted" numberOfLines={1}>
              {m.author ?? "Autor desconocido"}
            </Txt>
          </View>
        </Pressable>
      ))}

      <View style={[styles.card, { borderColor: palette.line }]}>
        <Txt variant="section">¿No aparece? Apúntalo a mano</Txt>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Título"
          placeholderTextColor={palette.faint}
          style={field}
        />
        <TextInput
          value={author}
          onChangeText={setAuthor}
          placeholder="Autor (opcional)"
          placeholderTextColor={palette.faint}
          style={field}
        />
        <TextInput
          value={chapters}
          onChangeText={setChapters}
          placeholder="Capítulos en total (opcional)"
          placeholderTextColor={palette.faint}
          keyboardType="number-pad"
          style={field}
        />
        <Button title="Apuntar manga" kind="primary" onPress={addManual} disabled={!title.trim()} />
      </View>
    </ScrollView>
  )
}


const styles = StyleSheet.create({
  tabs: { paddingLeft: space.lg, paddingBottom: space.md },
  categoryRow: { marginTop: -space.xs },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md },
  pad: { padding: space.lg, gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingLeft: space.md,
    paddingRight: space.sm,
  },
  fieldInput: { flex: 1, paddingVertical: space.md, fontSize: 14 },
  fieldIcon: { width: 28, alignItems: 'center' },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: 14,
  },
  result: {
    flexDirection: 'row',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultMain: { flex: 1, minWidth: 0, gap: 2 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
})
