import { useEffect, useState } from 'react'
import { ScrollView, View, StyleSheet, TextInput, ActivityIndicator, Linking } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useItem } from '../../src/hooks/useLibrary'
import { setMangaProgress, mangaPercent, statusLabel, updateItem, setReadUrl } from '../../src/lib/library'
import { findReadUrl, SEARCH_PAGE } from '../../src/lib/inmanga'
import { DetailHead } from '../../src/ui/DetailHead'
import { Txt } from '../../src/ui/Text'
import { Button } from '../../src/ui/Button'
import { Progress } from '../../src/ui/Progress'
import { Empty } from '../../src/ui/Screen'
import { usePalette } from '../../src/ui/ThemeProvider'
import { useToast } from '../../src/ui/Toast'
import { radius, space } from '../../src/ui/theme'
import { DetailControls } from '../../src/components/DetailControls'
import { WatchedDate } from '../../src/components/WatchedDate'

export default function MangaDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const palette = usePalette()
  const toast = useToast()
  const item = useItem(id)

  const [chapter, setChapter] = useState('')
  const [total, setTotal] = useState('')
  const [url, setUrl] = useState('')
  const [finding, setFinding] = useState(false)

  useEffect(() => {
    if (!item) return
    setChapter(String(item.currentChapter ?? 0))
    setTotal(item.totalChapters ? String(item.totalChapters) : '')
    setUrl(item.readUrl ?? '')
    // Solo al cambiar de manga: si dependiera del objeto entero, cada guardado
    // pisaría lo que estás escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id])

  if (item === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator color={palette.muted} />
      </View>
    )
  }
  if (!item) return <Empty text="No encontrado." />

  const percent = mangaPercent(item)

  const saveChapter = async () => {
    const n = parseInt(chapter, 10)
    if (!Number.isFinite(n) || n < 0) return
    await setMangaProgress(item.id, n)
    toast(`Vas por el capítulo ${n}`)
  }

  const saveTotal = async () => {
    const n = parseInt(total, 10)
    if (!Number.isFinite(n) || n <= 0) return
    await updateItem(item.id, { totalChapters: n })
    await setMangaProgress(item.id, item.currentChapter ?? 0)
  }

  /** Reintenta encontrarlo, por si se añadió cuando su web no respondía. */
  const findAgain = async () => {
    setFinding(true)
    try {
      const found = await findReadUrl(item.title)
      if (found) {
        setUrl(found)
        await setReadUrl(item.id, found)
        toast('Enlace encontrado')
      } else {
        toast('No aparece en inManga; pega el enlace a mano')
      }
    } finally {
      setFinding(false)
    }
  }

  const field = [
    styles.input,
    { borderColor: palette.line, color: palette.fg, backgroundColor: palette.surface },
  ]

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <DetailHead
        poster={item.poster}
        type="manga"
        title={item.title}
        meta={[item.author, item.year, statusLabel(item.status, 'manga')].filter(Boolean).join(' · ')}
      >
        {item.readUrl ? (
          <Button
            title="Leer en inManga"
            kind="primary"
            small
            style={styles.cta}
            onPress={() => Linking.openURL(item.readUrl!)}
          />
        ) : null}
        {item.status === 'completed' && (
          <WatchedDate
            timestamp={item.completedAt}
            label="Leído"
            onChange={(ts) => updateItem(item.id, { completedAt: ts })}
          />
        )}
      </DetailHead>

      <View style={styles.block}>
        <Txt variant="section">Por dónde vas</Txt>
        {item.totalChapters ? (
          <>
            <View style={styles.row}>
              <Txt variant="small" tone="muted">
                Capítulo {item.currentChapter ?? 0} de {item.totalChapters}
              </Txt>
              <Txt variant="data">{percent}%</Txt>
            </View>
            <Progress value={percent / 100} />
          </>
        ) : (
          <Txt variant="small" tone="muted">
            No sabemos cuántos capítulos tiene. Escríbelo abajo para ver el porcentaje.
          </Txt>
        )}
      </View>

      <View style={styles.block}>
        <Txt variant="label" tone="muted">
          Capítulo por el que vas
        </Txt>
        <View style={styles.row}>
          <TextInput
            value={chapter}
            onChangeText={setChapter}
            onBlur={saveChapter}
            keyboardType="number-pad"
            placeholderTextColor={palette.faint}
            style={[...field, { flex: 1 }]}
          />
          <Button title="Guardar" kind="primary" small onPress={saveChapter} />
        </View>
      </View>

      <View style={styles.block}>
        <Txt variant="label" tone="muted">
          Capítulos en total
        </Txt>
        <View style={styles.row}>
          <TextInput
            value={total}
            onChangeText={setTotal}
            onBlur={saveTotal}
            keyboardType="number-pad"
            placeholder="p. ej. 364"
            placeholderTextColor={palette.faint}
            style={[...field, { flex: 1 }]}
          />
          <Button title="Guardar" small onPress={saveTotal} />
        </View>
      </View>

      <View style={styles.block}>
        <Txt variant="label" tone="muted">
          Enlace para leerlo
        </Txt>
        <TextInput
          value={url}
          onChangeText={setUrl}
          onBlur={() => setReadUrl(item.id, url.trim() || undefined)}
          placeholder="https://inmanga.com/ver/manga/…"
          placeholderTextColor={palette.faint}
          autoCapitalize="none"
          autoCorrect={false}
          style={field}
        />
        <View style={styles.row}>
          <Button
            title={finding ? 'Buscando…' : 'Buscarlo por mí'}
            small
            onPress={findAgain}
            disabled={finding}
          />
          <Button
            title="Abrir inManga"
            small
            kind="ghost"
            onPress={() => Linking.openURL(SEARCH_PAGE)}
          />
        </View>
        <Txt variant="small" tone="faint">
          Si no lo encuentra, búscalo tú en inManga y pega aquí la dirección.
        </Txt>
      </View>

      <DetailControls item={item} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  block: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, justifyContent: 'space-between' },
  cta: { alignSelf: 'flex-start', marginTop: space.xs },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: 14,
  },
})