import { useState } from 'react'
import { View, FlatList, StyleSheet, TextInput, Pressable, Alert, Linking } from 'react-native'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import { Screen, Empty } from '../../src/ui/Screen'
import { Txt } from '../../src/ui/Text'
import { Button } from '../../src/ui/Button'
import { usePalette } from '../../src/ui/ThemeProvider'
import { useToast } from '../../src/ui/Toast'
import { radius, space } from '../../src/ui/theme'
import { useVideos } from '../../src/hooks/useLibrary'
import { importVideos, deleteItem } from '../../src/lib/library'
import { parseTakeout } from '../../src/lib/youtube'
import { pickJsonFile } from '../../src/lib/backup'

function fecha(ts?: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Los vídeos viven aquí y no en la Biblioteca: al importar el historial de
 * Takeout pueden entrar miles y sepultarían series y películas. `FlatList`
 * virtualiza, así que se quitó el «Ver más» que hacía falta en la web.
 */
export default function VideosScreen() {
  const router = useRouter()
  const palette = usePalette()
  const toast = useToast()
  const { data: videos, ready } = useVideos()
  const [query, setQuery] = useState('')
  const [importing, setImporting] = useState(false)

  const q = query.trim().toLowerCase()
  const filtered = q
    ? videos.filter(
        (v) => v.title.toLowerCase().includes(q) || (v.author ?? '').toLowerCase().includes(q),
      )
    : videos

  const doImport = async () => {
    setImporting(true)
    try {
      const raw = await pickJsonFile()
      if (!raw) return
      const entries = parseTakeout(raw)
      if (entries.length === 0) {
        toast('No he encontrado vídeos en ese fichero')
        return
      }
      const res = await importVideos(entries)
      Alert.alert(
        'Historial importado',
        `${res.added} vídeos nuevos. ${res.skipped} ya estaban.`,
      )
    } catch (e) {
      Alert.alert('Error al importar', e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setImporting(false)
    }
  }

  const remove = (id: string, title: string) =>
    Alert.alert('¿Quitar vídeo?', title, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => deleteItem(id) },
    ])

  return (
    <Screen title="Vídeos" padded={false}>
      <FlatList
        data={filtered}
        keyExtractor={(v) => v.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={[styles.card, { borderColor: palette.line }]}>
              <Txt variant="section">Importar historial de YouTube</Txt>
              <Txt variant="small" tone="muted">
                En Google Takeout elige solo YouTube → historial, en formato JSON, y sube aquí el
                fichero watch-history.json. Se ignoran anuncios y vídeos borrados, y los repetidos
                no se duplican.
              </Txt>
              <Button
                title={importing ? 'Importando…' : 'Subir watch-history.json'}
                kind="primary"
                onPress={doImport}
                disabled={importing}
              />
            </View>

            {videos.length > 0 && (
              <>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={`Buscar entre ${videos.length} vídeos…`}
                  placeholderTextColor={palette.faint}
                  style={[
                    styles.input,
                    { borderColor: palette.line, color: palette.fg, backgroundColor: palette.surface },
                  ]}
                />
                <Txt variant="data" tone="faint">
                  {filtered.length} vídeo{filtered.length === 1 ? '' : 's'}
                  {q ? ' encontrados' : ''}
                </Txt>
              </>
            )}
          </View>
        }
        ListEmptyComponent={
          !ready ? null : videos.length === 0 ? (
            <Empty text="Aún no tienes vídeos guardados.">
              <Button title="Añadir uno" kind="primary" onPress={() => router.push('/search')} />
            </Empty>
          ) : (
            <Empty text="Ninguno coincide con esa búsqueda." />
          )
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { borderColor: palette.line }]}>
            <Pressable
              onPress={() => item.url && Linking.openURL(item.url)}
              disabled={!item.url}
              style={styles.tap}
            >
              {item.poster ? (
                <Image
                  source={{ uri: item.poster }}
                  style={[styles.thumb, { backgroundColor: palette.surface2 }]}
                  contentFit="cover"
                  cachePolicy="disk"
                />
              ) : (
                <View style={[styles.thumb, { backgroundColor: palette.surface2 }]} />
              )}
              <View style={styles.main}>
                <Txt variant="small" numberOfLines={2} style={{ fontWeight: '600' }}>
                  {item.title}
                </Txt>
                <Txt variant="data" tone="faint" numberOfLines={1}>
                  {item.author ? `${item.author} · ` : ''}
                  {fecha(item.completedAt)}
                </Txt>
              </View>
            </Pressable>
            <Pressable
              onPress={() => remove(item.id, item.title)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Quitar ${item.title}`}
            >
              <Txt variant="body" tone="faint">
                ✕
              </Txt>
            </Pressable>
          </View>
        )}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  header: { gap: space.md, paddingBottom: space.md },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minWidth: 0 },
  thumb: { width: 88, aspectRatio: 16 / 9, borderRadius: radius.sm },
  main: { flex: 1, minWidth: 0, gap: 2 },
})
