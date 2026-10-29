import { View, StyleSheet, Alert } from 'react-native'
import { startRewatch, summarizeRounds, undoMovieRewatch } from '../lib/library'
import { fmtDate } from './WatchedDate'
import { Txt } from '../ui/Text'
import { Button } from '../ui/Button'
import { space } from '../ui/theme'
import type { PastWatch } from '../types'

/**
 * Pide confirmación antes de empezar a ver otra vez una serie. Nada se pierde
 * (las fechas pasan al historial), pero los episodios se desmarcan de golpe y
 * eso asusta si se pulsa sin querer.
 */
export function askRewatch(itemId: string, title: string): void {
  Alert.alert(
    '¿Verla otra vez?',
    `Los episodios de "${title}" se desmarcan para seguir el progreso desde cero. Las fechas en que los viste se guardan en el historial.`,
    [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Verla otra vez', onPress: () => startRewatch(itemId) },
    ],
  )
}

function range(from?: number, to?: number): string | null {
  if (from === undefined || to === undefined) return null
  const a = fmtDate(from)
  const b = fmtDate(to)
  return a === b ? a : `${a} – ${b}`
}

/** «1.ª vez · 24 episodios · 3 mar 2024 – 12 may 2024», una línea por visionado. */
export function PastViewings({ past }: { past: PastWatch[] }) {
  const rounds = summarizeRounds(past)
  if (!rounds.length) return null
  return (
    <View style={styles.wrap}>
      <Txt variant="label" tone="muted">
        Visionados anteriores
      </Txt>
      {rounds.map((r) => (
        <Txt key={r.round} variant="small" tone="muted">
          {[
            `${r.round}.ª vez`,
            `${r.episodes} episodio${r.episodes === 1 ? '' : 's'}`,
            range(r.from, r.to),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Txt>
      ))}
    </View>
  )
}

/**
 * Las veces anteriores que viste una película, de la más reciente a la más
 * antigua. La actual no sale aquí: es la fecha de «Visto» de arriba.
 */
export function MoviePastViewings({ itemId, past }: { itemId: string; past: PastWatch[] }) {
  if (!past.length) return null
  const sorted = [...past].sort((a, b) => b.round - a.round)

  // Con confirmación: deshacer cambia la fecha de «Visto» por la anterior, y
  // la que hubiera se pierde.
  const confirmUndo = () =>
    Alert.alert(
      '¿Quitar el último visionado?',
      'La fecha de «Visto» vuelve a ser la de la vez anterior.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Quitar', style: 'destructive', onPress: () => undoMovieRewatch(itemId) },
      ],
    )

  return (
    <View style={styles.wrap}>
      <Txt variant="small" tone="muted">
        Vista {past.length + 1} veces · antes:{' '}
        {sorted.map((w) => (w.watchedAt ? fmtDate(w.watchedAt) : 'sin fecha')).join(', ')}
      </Txt>
      <Button title="Quitar el último visionado" small kind="ghost" onPress={confirmUndo} style={styles.left} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  left: { alignSelf: 'flex-start' },
})
