import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { Image, type ImageStyle } from 'expo-image'
import { usePalette } from './ThemeProvider'
import { Txt } from './Text'
import { radius, POSTER_RATIO, space } from './theme'
import type { MediaType } from '../types'

const FALLBACK: Record<MediaType, string> = {
  series: 'Serie',
  movie: 'Película',
  book: 'Libro',
  // Ya no se puede añadir manga, pero los que se apuntaron antes siguen en la
  // base de datos con este tipo (ver `MediaType`).
  manga: 'Manga',
  custom: '-',
}

interface Props {
  uri?: string
  type: MediaType
  /** Título, para el hueco cuando no hay carátula. */
  title?: string
  width: number
  /** Se aplica a la imagen o al hueco, según haya carátula o no. */
  style?: StyleProp<ViewStyle>
}

/**
 * Carátula. `expo-image` la guarda en disco, así que una vez vista se sigue
 * viendo sin conexión, algo que en la web dependía del service worker.
 *
 * Cuando no hay imagen (libros a mano, vídeos sin miniatura) el hueco muestra el
 * título en pequeño en vez de un icono genérico: en una rejilla de carátulas, un
 * hueco con texto sigue siendo reconocible.
 */
export function Poster({ uri, type, title, width, style }: Props) {
  const palette = usePalette()
  const height = width / POSTER_RATIO

  if (!uri) {
    return (
      <View
        style={[
          styles.base,
          { width, height, backgroundColor: palette.surface2, padding: space.sm },
          style,
        ]}
      >
        <Txt variant="small" tone="muted" numberOfLines={4} style={styles.fallbackText}>
          {title || FALLBACK[type]}
        </Txt>
      </View>
    )
  }

  return (
    <Image
      source={{ uri }}
      // expo-image usa ImageStyle, más estrecho que ViewStyle; las propiedades
      // que se pasan aquí (tamaño, radio, fondo) son válidas en ambos.
      style={
        [
          styles.base,
          { width, height, backgroundColor: palette.surface2 },
          style,
        ] as unknown as StyleProp<ImageStyle>
      }
      contentFit="cover"
      transition={140}
      cachePolicy="disk"
    />
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: { textAlign: 'center' },
})
