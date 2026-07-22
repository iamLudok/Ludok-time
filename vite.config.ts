import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ command, isPreview }) => {
  // La app se publica en GitHub Pages bajo https://iamludok.github.io/Ludok-time/,
  // así que en el build todas las rutas deben colgar de ese subdirectorio.
  // `preview` también lo usa, para probar en local igual que en producción.
  // Solo `npm run dev` sirve desde '/' (localhost raíz).
  const BASE = command === 'build' || isPreview ? '/Ludok-time/' : '/'

  return {
    base: BASE,
    plugins: [
      react(),
      VitePWA({
        // La app se actualiza sola: el código se reemplaza, los datos de IndexedDB
        // (tu biblioteca) no se tocan nunca.
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png'],
        manifest: {
          id: BASE,
          scope: BASE,
          start_url: BASE,
          name: 'Ludok Time',
          short_name: 'Ludok Time',
          description: 'Registra todo lo que ves: series, pelis y anime. Tus datos, tuyos.',
          lang: 'es',
          theme_color: '#0f1115',
          background_color: '#0f1115',
          display: 'standalone',
          orientation: 'portrait',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Cachea el shell de la app para que abra offline.
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          // Rutas desconocidas (deep links) caen en index.html: es una SPA.
          navigateFallback: BASE + 'index.html',
          // Cachea imágenes de TMDB para verlas sin conexión una vez cargadas.
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.hostname === 'image.tmdb.org',
              handler: 'CacheFirst',
              options: {
                cacheName: 'tmdb-images',
                expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 60 },
              },
            },
          ],
        },
      }),
    ],
  }
})
