// Gestión del almacenamiento persistente del navegador.
// En móviles (y GrapheneOS), sin esto el navegador puede desalojar los datos
// del sitio si se queda sin espacio. Pedir persistencia reduce ese riesgo.

export interface StorageInfo {
  persisted: boolean
  supported: boolean
  usageBytes?: number
  quotaBytes?: number
}

/** Pide almacenamiento persistente. Devuelve true si quedó concedido. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/** Estado actual del almacenamiento (persistencia y uso/cuota). */
export async function getStorageInfo(): Promise<StorageInfo> {
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return { persisted: false, supported: false }
  }
  const info: StorageInfo = { persisted: false, supported: true }
  try {
    if (navigator.storage.persisted) info.persisted = await navigator.storage.persisted()
    if (navigator.storage.estimate) {
      const est = await navigator.storage.estimate()
      info.usageBytes = est.usage
      info.quotaBytes = est.quota
    }
  } catch {
    /* ignorar */
  }
  return info
}
