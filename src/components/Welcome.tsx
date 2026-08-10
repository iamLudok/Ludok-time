import { useState } from 'react'
import { ScrollView, View, StyleSheet, TextInput, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { updateSettings } from '../lib/settings'
import { pickJsonFile, importBackup } from '../lib/backup'
import { usePalette } from '../ui/ThemeProvider'
import { Txt } from '../ui/Text'
import { Button } from '../ui/Button'
import { radius, space } from '../ui/theme'

/**
 * Bienvenida en la primera apertura.
 *
 * Existe por una razón concreta: quien instala la app de cero se topaba con
 * «necesitas una API key de TMDB» sin ninguna explicación de qué es eso ni de
 * por qué hace falta. Aquí se explica antes de que se choque con ello, se puede
 * dejar para luego (libros y YouTube funcionan sin nada), y se ofrece importar
 * una copia, que es como llega quien ya venía usando la versión web.
 */
export function Welcome() {
  const palette = usePalette()
  const insets = useSafeAreaInsets()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [imported, setImported] = useState<string | null>(null)

  const finish = async (apiKey?: string) => {
    setBusy(true)
    try {
      // Guardar `onboardedAt` basta: la pantalla que muestra esto lee los
      // ajustes con una consulta reactiva y desaparece sola.
      await updateSettings({
        onboardedAt: Date.now(),
        ...(apiKey ? { tmdbApiKey: apiKey } : {}),
      })
    } finally {
      setBusy(false)
    }
  }

  const restore = async () => {
    setBusy(true)
    try {
      const raw = await pickJsonFile()
      if (!raw) return
      const res = await importBackup(raw, 'replace')
      setImported(`${res.items} títulos y ${res.episodes} episodios`)
    } catch (e) {
      setImported(e instanceof Error ? e.message : 'No se pudo importar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xxl },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.intro}>
        <Txt variant="display">Ludok Time</Txt>
        <Txt variant="body" tone="muted">
          Apunta las series, películas, libros y vídeos que ves. Todo se guarda solo en este
          móvil: no hay cuentas, ni servidores, ni nadie mirando.
        </Txt>
      </View>

      <View style={[styles.card, { borderColor: palette.line }]}>
        <Txt variant="section">Para buscar series y películas</Txt>
        <Txt variant="small" tone="muted">
          El catálogo lo pone TMDB, que pide que cada uno use su propia clave. Es gratis y son dos
          minutos: creas una cuenta, entras en Ajustes → API y copias la <Txt variant="small">API
          Key (v3 auth)</Txt>.
        </Txt>
        <Button
          title="Abrir themoviedb.org"
          onPress={() => Linking.openURL('https://www.themoviedb.org/settings/api')}
        />
        <TextInput
          value={key}
          onChangeText={setKey}
          placeholder="Pega aquí tu API key"
          placeholderTextColor={palette.faint}
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            styles.input,
            { borderColor: palette.line, color: palette.fg, backgroundColor: palette.surface },
          ]}
        />
        <Button
          title="Guardar y empezar"
          kind="primary"
          disabled={!key.trim() || busy}
          onPress={() => finish(key.trim())}
        />
        <Txt variant="small" tone="faint">
          Puedes dejarlo para luego: los libros y los vídeos de YouTube funcionan sin esto, y la
          clave se puede poner en cualquier momento desde Ajustes.
        </Txt>
      </View>

      <View style={[styles.card, { borderColor: palette.line }]}>
        <Txt variant="section">¿Vienes de la versión web?</Txt>
        <Txt variant="small" tone="muted">
          Si tienes una copia exportada, impórtala ahora y te lo trae todo: títulos, episodios
          vistos, fechas y valoraciones.
        </Txt>
        <Button title="Importar una copia" onPress={restore} disabled={busy} />
        {imported ? (
          <Txt variant="small" tone="muted">
            {imported}
          </Txt>
        ) : null}
      </View>

      <Button title="Ahora no, entrar" kind="ghost" disabled={busy} onPress={() => finish()} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, gap: space.lg },
  intro: { gap: space.sm, paddingBottom: space.sm },
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
})
