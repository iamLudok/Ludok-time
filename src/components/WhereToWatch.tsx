import { View, StyleSheet, Pressable, Linking } from 'react-native'
import { Image } from 'expo-image'
import type { WatchProviders } from '../lib/tmdb'
import { providerSearchUrl, baseProviderName } from '../lib/streamingLinks'
import { usePalette } from '../ui/ThemeProvider'
import { Txt } from '../ui/Text'
import { radius, space } from '../ui/theme'

/**
 * Dónde ver una serie/película en España (datos de JustWatch vía TMDB). Consulta
 * en vivo y no se guarda: la disponibilidad cambia. Si falla o no hay datos, no
 * muestra nada: es información secundaria y no debe romper la ficha.
 */
export function WhereToWatch({
  data,
  title,
}: {
  /** Lo trae la pantalla, que ya pide todo junto en una sola petición. */
  data: WatchProviders | null | undefined
  title: string
}) {
  const palette = usePalette()

  if (!data || data.providers.length === 0) return null

  // TMDB lista variantes de la misma plataforma como proveedores distintos
  // ("Netflix" y "Netflix Standard with Ads"), y alquiler y compra repiten
  // plataforma: se quitan duplicados por nombre base.
  const dedupe = (list: WatchProviders['providers']) => [
    ...new Map(list.map((p) => [baseProviderName(p.name), p])).values(),
  ]
  const flatrate = dedupe(data.providers.filter((p) => p.type === 'flatrate'))
  const other = dedupe(data.providers.filter((p) => p.type !== 'flatrate'))

  const Row = ({ label, list }: { label: string; list: WatchProviders['providers'] }) => (
    <View style={styles.row}>
      <Txt variant="label" tone="faint">
        {label}
      </Txt>
      <View style={styles.logos}>
        {list.map((p) => {
          const url = providerSearchUrl(p.name, title)
          return (
            <Pressable
              key={p.name}
              disabled={!url}
              onPress={() => url && Linking.openURL(url)}
              accessibilityRole="link"
              accessibilityLabel={url ? `Buscar ${title} en ${p.name}` : p.name}
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
            >
              <Image
                source={{ uri: p.logoUrl }}
                style={styles.logo}
                contentFit="cover"
                cachePolicy="disk"
              />
            </Pressable>
          )
        })}
      </View>
    </View>
  )

  return (
    <View style={[styles.card, { borderColor: palette.line }]}>
      <Txt variant="section">Dónde verla</Txt>
      {flatrate.length > 0 && <Row label="Con suscripción" list={flatrate} />}
      {other.length > 0 && <Row label="Alquiler / compra" list={other} />}
      <Txt variant="small" tone="faint">
        España · toca un logo para buscarlo ahí · datos de JustWatch
      </Txt>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  row: { gap: space.sm },
  logos: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  logo: { width: 38, height: 38, borderRadius: radius.md },
})
