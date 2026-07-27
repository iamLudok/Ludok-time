// Tiene que ir ANTES que cualquier otra cosa: los clientes de TMDB, Open
// Library y Google Books construyen sus URLs con `URL` + `searchParams`, y el
// motor de React Native (Hermes) no los trae completos — sin esto, todas las
// llamadas a las APIs fallarían con "URLSearchParams.get is not implemented".
// Es lo que permite reutilizar esos ficheros idénticos a los de la web.
import 'react-native-url-polyfill/auto'
import { useEffect, useState } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { View, ActivityIndicator } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
// Importar `db` crea el esquema de forma síncrona: para cuando esto se
// evalúa, las tablas ya existen y cualquier pantalla puede consultar.
import '../src/lib/db'
import { ensureSettings } from '../src/lib/settings'
import { ThemeProvider, usePalette, useIsDark } from '../src/ui/ThemeProvider'
import { ToastProvider } from '../src/ui/Toast'
import { Txt } from '../src/ui/Text'
import { space } from '../src/ui/theme'

export default function RootLayout() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Las tablas ya están creadas (al importar `db`). Aquí solo se persisten
    // los ajustes por defecto la primera vez.
    ensureSettings()
      .then(() => setReady(true))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Error al abrir la base de datos'),
      )
  }, [])

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ToastProvider>
          <Shell ready={ready} error={error} />
        </ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}

function Shell({ ready, error }: { ready: boolean; error: string | null }) {
  const palette = usePalette()
  const isDark = useIsDark()

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Txt variant="body" tone="danger" style={{ textAlign: 'center' }}>
          {error}
        </Txt>
      </View>
    )
  }

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ActivityIndicator color={palette.muted} />
      </View>
    )
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  )
}
