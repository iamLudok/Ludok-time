// Una PWA instalada puede pasar días sin comprobar si hay una versión nueva:
// por defecto solo mira al arrancar. Aquí forzamos la comprobación cada hora y
// cada vez que vuelves a la app, para que las mejoras te lleguen pronto.
//
// Ojo: actualizar solo reemplaza el CÓDIGO. Los datos (IndexedDB) no se tocan.

const CHECK_EVERY_MS = 60 * 60 * 1000 // 1 hora

export function watchForUpdates(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  const check = async () => {
    if (!navigator.onLine) return // sin conexión no hay nada que comprobar
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      await registration?.update()
    } catch {
      /* el service worker aún no está listo: se reintentará */
    }
  }

  setInterval(check, CHECK_EVERY_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
}
