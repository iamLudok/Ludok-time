import { useState } from 'react'
import { Pressable, View, StyleSheet, Platform } from 'react-native'
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { Txt } from '../ui/Text'
import { Button } from '../ui/Button'
import { space } from '../ui/theme'

function fmt(ts: number): string {
  return new Date(ts).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Muestra «Visto: 22 jul 2026» y deja corregir la fecha con el selector del
 * sistema, o quitarla del todo si no te acuerdas de cuándo fue. Sirve para
 * volcar historial antiguo sin que quede como si lo hubieras visto hoy.
 */
export function WatchedDate({
  timestamp,
  onChange,
  label = 'Visto',
}: {
  timestamp?: number
  onChange: (ts: number | undefined) => void
  label?: string
}) {
  const [picking, setPicking] = useState(false)

  const onPicked = (event: DateTimePickerEvent, date?: Date) => {
    // En Android el diálogo se cierra solo; hay que quitarlo del árbol o no
    // se puede volver a abrir.
    if (Platform.OS !== 'ios') setPicking(false)
    if (event.type === 'dismissed' || !date) return
    // Mediodía: evita que un cambio de zona horaria mueva la fecha un día.
    date.setHours(12, 0, 0, 0)
    onChange(date.getTime())
  }

  return (
    <View style={styles.wrap}>
      <Pressable onPress={() => setPicking(true)} hitSlop={6} accessibilityRole="button">
        <Txt variant="small" tone="muted">
          {timestamp ? `${label}: ${fmt(timestamp)}` : `${label} sin fecha`} ✎
        </Txt>
      </Pressable>
      {timestamp !== undefined && (
        <Button title="Quitar" small kind="ghost" onPress={() => onChange(undefined)} />
      )}
      {picking && (
        <DateTimePicker
          mode="date"
          display="default"
          value={timestamp ? new Date(timestamp) : new Date()}
          maximumDate={new Date()}
          onChange={onPicked}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
})
