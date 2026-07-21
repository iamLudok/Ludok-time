import Dexie, { type Table } from 'dexie'
import type { Item, Episode, Activity, Settings } from '../types'

export const SCHEMA_VERSION = 1

export class LudokDB extends Dexie {
  items!: Table<Item, string>
  episodes!: Table<Episode, string>
  activity!: Table<Activity, string>
  settings!: Table<Settings, string>

  constructor() {
    super('ludok-time')
    // v1 declaró un índice sobre `watched` (booleano), que IndexedDB no admite
    // como clave. v2 lo elimina; consultamos episodios por itemId y filtramos en JS.
    this.version(1).stores({
      items: 'id, type, status, title, addedAt',
      episodes: 'id, itemId, [itemId+season], watched, watchedAt',
      activity: 'id, itemId, at, kind',
      settings: 'id',
    })
    this.version(2).stores({
      items: 'id, type, status, title, addedAt',
      episodes: 'id, itemId, [itemId+season], watchedAt',
      activity: 'id, itemId, at, kind',
      settings: 'id',
    })
  }
}

export const db = new LudokDB()

/** Genera un id único (usa crypto.randomUUID cuando está disponible). */
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)
}
