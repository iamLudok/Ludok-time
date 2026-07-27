import { useEffect, useState } from 'react'
import { ScrollView, View, StyleSheet, TextInput, ActivityIndicator } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useItem } from '../../src/hooks/useLibrary'
import { setBookProgress, bookPercent, statusLabel, updateItem } from '../../src/lib/library'
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

export default function BookDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const palette = usePalette()
  const toast = useToast()
  const item = useItem(id)

  const [page, setPage] = useState('')
  const [total, setTotal] = useState('')

  useEffect(() => {
    if (!item) return
    setPage(String(item.currentPage ?? 0))
    setTotal(item.totalPages ? String(item.totalPages) : '')
    // Solo al cambiar de libro: si dependiera del objeto entero, cada guardado
    // pisaría lo que estás escribiendo mientras escribes.
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

  const percent = bookPercent(item)

  const savePage = async () => {
    const n = parseInt(page, 10)
    if (!Number.isFinite(n) || n < 0) return
    await setBookProgress(item.id, n)
    toast(`Vas por la página ${n}`)
  }

  const saveTotal = async () => {
    const n = parseInt(total, 10)
    if (!Number.isFinite(n) || n <= 0) return
    await updateItem(item.id, { totalPages: n })
    // Recalcula el estado con el nuevo total.
    await setBookProgress(item.id, item.currentPage ?? 0)
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
        type="book"
        title={item.title}
        meta={[item.author ?? 'Autor desconocido', item.year, statusLabel(item.status, 'book')]
          .filter(Boolean)
          .join(' · ')}
      >
        {item.status === 'completed' && (
          <WatchedDate
            timestamp={item.completedAt}
            label="Leído"
            onChange={(ts) => updateItem(item.id, { completedAt: ts })}
          />
        )}
      </DetailHead>

      <View style={styles.block}>
        <Txt variant="section">Progreso de lectura</Txt>
        {item.totalPages ? (
          <>
            <View style={styles.row}>
              <Txt variant="small" tone="muted">
                Página {item.currentPage ?? 0} de {item.totalPages}
              </Txt>
              <Txt variant="data">{percent}%</Txt>
            </View>
            <Progress value={percent / 100} />
          </>
        ) : (
          <Txt variant="small" tone="muted">
            No sabemos cuántas páginas tiene. Escríbelo abajo para ver el porcentaje.
          </Txt>
        )}
      </View>

      <View style={styles.block}>
        <Txt variant="label" tone="muted">
          ¿Por qué página vas?
        </Txt>
        <View style={styles.row}>
          <TextInput
            value={page}
            onChangeText={setPage}
            onBlur={savePage}
            keyboardType="number-pad"
            placeholderTextColor={palette.faint}
            style={[...field, { flex: 1 }]}
          />
          <Button title="Guardar" kind="primary" small onPress={savePage} />
        </View>
      </View>

      <View style={styles.block}>
        <Txt variant="label" tone="muted">
          Páginas totales
        </Txt>
        <View style={styles.row}>
          <TextInput
            value={total}
            onChangeText={setTotal}
            onBlur={saveTotal}
            keyboardType="number-pad"
            placeholder="p. ej. 592"
            placeholderTextColor={palette.faint}
            style={[...field, { flex: 1 }]}
          />
          <Button title="Guardar" small onPress={saveTotal} />
        </View>
      </View>

      {item.totalPages && item.status !== 'completed' ? (
        <Button
          title="Marcar como terminado"
          kind="primary"
          onPress={async () => {
            await setBookProgress(item.id, item.totalPages!)
            setPage(String(item.totalPages))
            toast('¡Libro terminado!')
          }}
        />
      ) : null}

      <DetailControls item={item} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  block: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, justifyContent: 'space-between' },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: 14,
  },
})
