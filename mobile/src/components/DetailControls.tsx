import { View, StyleSheet, Pressable, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { setStatus, setRating, deleteItem, statusLabel } from '../lib/library'
import { usePalette } from '../ui/ThemeProvider'
import { Txt } from '../ui/Text'
import { Button } from '../ui/Button'
import { Chips, type ChipOption } from '../ui/Chips'
import { radius, space } from '../ui/theme'
import type { Item, Status } from '../types'

const STATUSES: Status[] = ['plan', 'watching', 'completed', 'on_hold', 'dropped']

/**
 * Estado, valoración y borrar. No hay etiquetas ni notas: se quitaron a
 * propósito porque no se usaban, y la valoración hace de «favorito» al poder
 * ordenar la biblioteca por nota.
 */
export function DetailControls({ item }: { item: Item }) {
  const router = useRouter()
  const palette = usePalette()

  const options: ChipOption<Status>[] = STATUSES.map((s) => ({
    key: s,
    label: statusLabel(s, item.type),
  }))

  const confirmDelete = () => {
    Alert.alert('¿Quitar de la biblioteca?', `"${item.title}" y todo su progreso.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          await deleteItem(item.id)
          router.back()
        },
      },
    ])
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.block}>
        <Txt variant="label" tone="muted">
          Estado
        </Txt>
        <Chips options={options} value={item.status} onChange={(s) => setStatus(item.id, s)} />
      </View>

      <View style={styles.block}>
        <Txt variant="label" tone="muted">
          Tu nota
        </Txt>
        <Rating value={item.rating} onChange={(v) => setRating(item.id, v)} />
      </View>

      <Button title="Quitar de la biblioteca" kind="danger" onPress={confirmDelete} />
      <View style={[styles.rule, { backgroundColor: palette.line }]} />
    </View>
  )
}

/**
 * 0–10 en cinco estrellas de dos puntos. Volver a pulsar la estrella activa
 * baja un punto, así se pueden poner notas impares (9, 7…) sin más controles.
 */
function Rating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const palette = usePalette()
  return (
    <View style={styles.rating}>
      {[1, 2, 3, 4, 5].map((s) => {
        const points = s * 2
        const on = value >= points
        return (
          <Pressable
            key={s}
            onPress={() => onChange(value === points ? points - 1 : points)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`${points} de 10`}
          >
            <Txt style={{ fontSize: 24, color: on ? palette.fg : palette.line }}>★</Txt>
          </Pressable>
        )
      })}
      <Txt variant="data" tone="muted" style={{ marginLeft: space.sm }}>
        {value > 0 ? `${value}/10` : 'sin valorar'}
      </Txt>
      {value > 0 && <Button title="Quitar" small kind="ghost" onPress={() => onChange(0)} />}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg, paddingTop: space.lg },
  block: { gap: space.sm },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rule: { height: StyleSheet.hairlineWidth, borderRadius: radius.sm },
})
