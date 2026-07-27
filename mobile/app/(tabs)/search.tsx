import { useState } from 'react'
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
import { useSettings } from '../../src/hooks/useSettings'
import { searchMulti, posterUrl, type TmdbSearchResult } from '../../src/lib/tmdb'
import { searchBooks, type BookResult } from '../../src/lib/openlibrary'
import { searchGoogleBooks } from '../../src/lib/googlebooks'
import { videoIdFromUrl, thumbnailUrl, fetchVideoInfo } from '../../src/lib/youtube'
import { addVideo, addManualVideo, addManualBook } from '../../src/lib/library'
import { setBookPreview } from '../../src/lib/bookPreview'

type Tab = 'screen' | 'books' | 'video'

const TABS: readonly ChipOption<Tab>[] = [
  { key: 'screen', label: 'Series y pelis' },
  { key: 'books', label: 'Libros' },
  { key: 'video', label: 'YouTube' },
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
      {tab === 'video' && <VideoAdd />}
    </Screen>
  )
}

/** Campo de búsqueda, compartido por las tres pestañas. */
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
    <View style={styles.row}>
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={palette.faint}
        returnKeyType="search"
        autoCapitalize="none"
        style={[
          styles.input,
          { flex: 1, borderColor: palette.line, color: palette.fg, backgroundColor: palette.surface },
        ]}
      />
      <Button title={loading ? '…' : 'Buscar'} kind="primary" onPress={onSubmit} disabled={loading} />
    </View>
  )
}

/* --- Series y películas (TMDB) -------------------------------------------- */

function ScreenSearch() {
  const router = useRouter()
  const palette = usePalette()
  const settings = useSettings()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TmdbSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const doSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError('')
    try {
      setResults(await searchMulti(query))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al buscar')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  if (!settings.tmdbApiKey) {
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

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <SearchField
        value={query}
        onChange={setQuery}
        onSubmit={doSearch}
        placeholder="Buscar serie o película…"
        loading={loading}
      />
      {error ? (
        <Txt variant="small" tone="danger">
          {error}
        </Txt>
      ) : null}
      {results.map((r) => (
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

/* --- Libros (Open Library + Google Books + a mano) ------------------------- */

const SOURCE_LABEL: Record<BookResult['source'], string> = {
  openlibrary: 'Open Library',
  googlebooks: 'Google Books',
}

function BookSearch() {
  const router = useRouter()
  const palette = usePalette()
  const toast = useToast()
  const settings = useSettings()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BookResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [pages, setPages] = useState('')

  const doSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError('')
    try {
      // Dos fuentes independientes: si una falla (p. ej. la cuota diaria de
      // Google Books sin API key), la otra sigue funcionando igual.
      const [ol, gb] = await Promise.allSettled([
        searchBooks(query),
        searchGoogleBooks(query, settings.googleBooksApiKey || undefined),
      ])
      setResults([
        ...(ol.status === 'fulfilled' ? ol.value : []),
        ...(gb.status === 'fulfilled' ? gb.value : []),
      ])
      if (ol.status === 'rejected' && gb.status === 'rejected') {
        setError('No se pudo buscar en ninguna fuente. Prueba a apuntarlo a mano abajo.')
      } else if (gb.status === 'rejected') {
        setError(gb.reason instanceof Error ? gb.reason.message : 'Google Books no respondió.')
      }
    } finally {
      setLoading(false)
    }
  }

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
        onSubmit={doSearch}
        placeholder="Buscar libro por título o autor…"
        loading={loading}
      />
      <Txt variant="small" tone="faint">
        Open Library + Google Books
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

/* --- Vídeos de YouTube ----------------------------------------------------- */

function VideoAdd() {
  const router = useRouter()
  const palette = usePalette()
  const toast = useToast()
  const [url, setUrl] = useState('')
  const [manual, setManual] = useState('')
  const [busy, setBusy] = useState(false)

  const videoId = videoIdFromUrl(url)

  const addFromUrl = async () => {
    if (!videoId) return
    setBusy(true)
    try {
      const info = await fetchVideoInfo(videoId)
      const title = info?.title ?? `Vídeo ${videoId}`
      await addVideo({ videoId, title, channel: info?.channel })
      toast(info ? `Añadido: ${title}` : 'Añadido (sin título: privado o borrado)')
      setUrl('')
      router.push('/videos')
    } catch {
      toast('No se pudo añadir el vídeo')
    } finally {
      setBusy(false)
    }
  }

  const field = [
    styles.input,
    { borderColor: palette.line, color: palette.fg, backgroundColor: palette.surface },
  ]

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={[styles.card, { borderColor: palette.line }]}>
        <Txt variant="section">Pegar enlace</Txt>
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder="https://www.youtube.com/watch?v=…"
          placeholderTextColor={palette.faint}
          autoCapitalize="none"
          autoCorrect={false}
          style={field}
        />
        {videoId && (
          <View style={styles.row}>
            <Poster uri={thumbnailUrl(videoId)} type="youtube" width={90} />
            <Txt variant="small" tone="muted" style={{ flex: 1 }}>
              Vídeo detectado. El título se busca solo al añadirlo.
            </Txt>
          </View>
        )}
        {url && !videoId ? (
          <Txt variant="small" tone="muted">
            No reconozco ese enlace de YouTube.
          </Txt>
        ) : null}
        <Button
          title="Añadir vídeo"
          kind="primary"
          onPress={addFromUrl}
          disabled={!videoId || busy}
        />
      </View>

      <View style={[styles.card, { borderColor: palette.line }]}>
        <Txt variant="section">Apuntar a mano</Txt>
        <Txt variant="small" tone="muted">
          Sin enlace ni miniatura, solo el título.
        </Txt>
        <TextInput
          value={manual}
          onChangeText={setManual}
          placeholder="Título del vídeo"
          placeholderTextColor={palette.faint}
          style={field}
        />
        <Button
          title="Apuntar"
          onPress={async () => {
            if (!manual.trim()) return
            setBusy(true)
            try {
              await addManualVideo(manual.trim())
              toast('Añadido')
              setManual('')
              router.push('/videos')
            } finally {
              setBusy(false)
            }
          }}
          disabled={!manual.trim() || busy}
        />
      </View>

      {busy && <ActivityIndicator color={palette.muted} />}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  tabs: { paddingLeft: space.lg, paddingBottom: space.md },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md },
  pad: { padding: space.lg, gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
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
