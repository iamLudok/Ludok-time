import { useEffect, useState } from 'react'
import { ScrollView, View, StyleSheet, TextInput, Alert, Linking } from 'react-native'
import { Screen } from '../../src/ui/Screen'
import { Txt } from '../../src/ui/Text'
import { Button } from '../../src/ui/Button'
import { Chips } from '../../src/ui/Chips'
import { usePalette } from '../../src/ui/ThemeProvider'
import { radius, space } from '../../src/ui/theme'
import { useSettings } from '../../src/hooks/useSettings'
import { updateSettings } from '../../src/lib/settings'
import { shareBackup, pickJsonFile, importBackup, daysSinceBackup } from '../../src/lib/backup'
import { useLibraryItems, useAllEpisodes } from '../../src/hooks/useLibrary'
import { NextcloudSettings } from '../../src/components/NextcloudSettings'

const THEMES = [
  { key: 'system' as const, label: 'Sistema' },
  { key: 'dark' as const, label: 'Oscuro' },
  { key: 'light' as const, label: 'Claro' },
]

export default function SettingsScreen() {
  const settings = useSettings()
  const palette = usePalette()
  const { data: items } = useLibraryItems()
  const episodes = useAllEpisodes()

  const [tmdbKey, setTmdbKey] = useState('')
  const [gbKey, setGbKey] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => setTmdbKey(settings.tmdbApiKey), [settings.tmdbApiKey])
  useEffect(() => setGbKey(settings.googleBooksApiKey ?? ''), [settings.googleBooksApiKey])

  const days = daysSinceBackup(settings.lastBackup)
  const lastBackupText = !settings.lastBackup
    ? 'nunca'
    : days === 0
      ? 'hoy'
      : `hace ${days} ${days === 1 ? 'día' : 'días'}`

  const doExport = async () => {
    setBusy(true)
    try {
      await shareBackup()
    } catch (e) {
      Alert.alert('No se pudo exportar', e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setBusy(false)
    }
  }

  const doImport = async () => {
    setBusy(true)
    try {
      const raw = await pickJsonFile()
      if (!raw) return
      // Se pregunta DESPUÉS de elegir el fichero, para que la decisión de
      // reemplazar o fusionar se tome sabiendo ya qué copia es.
      Alert.alert(
        'Importar copia',
        '¿Reemplazar todo lo que hay ahora, o fusionar añadiendo sin borrar?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Fusionar', onPress: () => runImport(raw, 'merge') },
          {
            text: 'Reemplazar',
            style: 'destructive',
            onPress: () => runImport(raw, 'replace'),
          },
        ],
      )
    } catch (e) {
      Alert.alert('No se pudo leer', e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setBusy(false)
    }
  }

  const runImport = async (raw: string, mode: 'replace' | 'merge') => {
    setBusy(true)
    try {
      const res = await importBackup(raw, mode)
      const extra = res.discardedVideos
        ? `\n\nSe descartaron ${res.discardedVideos} vídeos de YouTube: esa parte ya no existe en la app.`
        : ''
      Alert.alert('Importado', `${res.items} títulos y ${res.episodes} episodios.${extra}`)
    } catch (e) {
      Alert.alert('Error al importar', e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setBusy(false)
    }
  }

  const field = [styles.input, { borderColor: palette.line, color: palette.fg, backgroundColor: palette.surface }]

  return (
    <Screen title="Ajustes" padded={false}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Copias — lo más importante de la app */}
        <Card>
          <Txt variant="title">Copia de seguridad</Txt>
          <Txt variant="small" tone="muted">
            Tus datos viven solo en este móvil. Exporta a menudo y guarda el fichero donde quieras.
          </Txt>
          <View style={[styles.stat, { borderColor: palette.line }]}>
            <Row label="Títulos" value={String(items.length)} />
            <Row label="Episodios" value={String(episodes.length)} />
            <Row label="Vistos" value={String(episodes.filter((e) => e.watched).length)} />
            <Row label="Última copia" value={lastBackupText} />
          </View>
          <Button title="Exportar copia" kind="primary" onPress={doExport} disabled={busy} />
          <Button title="Importar copia" onPress={doImport} disabled={busy} />
        </Card>

        <NextcloudSettings />

        {/* TMDB */}
        <Card>
          <Txt variant="title">API de TMDB</Txt>
          <Txt variant="small" tone="muted">
            Necesaria para buscar series y películas. Es gratis: créala en themoviedb.org y copia tu
            API Key (v3 auth).
          </Txt>
          <TextInput
            value={tmdbKey}
            onChangeText={setTmdbKey}
            placeholder="Pega aquí tu API key"
            placeholderTextColor={palette.faint}
            autoCapitalize="none"
            autoCorrect={false}
            style={field}
          />
          <View style={styles.actions}>
            <Button
              title="Guardar"
              kind="primary"
              small
              onPress={() => updateSettings({ tmdbApiKey: tmdbKey.trim() })}
            />
            <Button
              title="Abrir TMDB"
              small
              onPress={() => Linking.openURL('https://www.themoviedb.org/settings/api')}
            />
          </View>
        </Card>

        {/* Google Books */}
        <Card>
          <Txt variant="title">API de Google Books</Txt>
          <Txt variant="small" tone="muted">
            Opcional. Sin key propia se comparte una cuota diaria anónima que se agota fácil y deja
            de dar resultados; Open Library sigue funcionando igual.
          </Txt>
          <TextInput
            value={gbKey}
            onChangeText={setGbKey}
            placeholder="Pega aquí tu API key (opcional)"
            placeholderTextColor={palette.faint}
            autoCapitalize="none"
            autoCorrect={false}
            style={field}
          />
          <Button
            title="Guardar"
            kind="primary"
            small
            onPress={() => updateSettings({ googleBooksApiKey: gbKey.trim() })}
          />
        </Card>

        {/* Tema */}
        <Card>
          <Txt variant="title">Tema</Txt>
          <Txt variant="small" tone="muted">
            La app está diseñada en oscuro, pero el claro está cuidado igual.
          </Txt>
          <Chips
            options={THEMES}
            value={settings.theme}
            onChange={(theme) => updateSettings({ theme })}
          />
        </Card>

        <Txt variant="small" tone="faint" style={{ textAlign: 'center' }}>
          Ludok Time · tus datos, tuyos.
        </Txt>
      </ScrollView>
    </Screen>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  const palette = usePalette()
  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.line }]}>
      {children}
    </View>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Txt variant="small" tone="muted">
        {label}
      </Txt>
      <Txt variant="data">{value}</Txt>
    </View>
  )
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl, gap: space.md },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.md },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: 14,
  },
  actions: { flexDirection: 'row', gap: space.sm },
  stat: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: space.md, gap: space.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
})
