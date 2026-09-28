/**
 * The Gallery: finished emoji the user chose to keep, stored in this browser's
 * IndexedDB. Nothing here is uploaded anywhere, and nothing is saved unless the
 * user asks (the Save button, or the opt-in "save every download" switch).
 */

export interface GalleryItem {
  id: number
  name: string
  blob: Blob
  extension: 'png' | 'gif'
  size: number
  bytes: number
  /** Which destination it was sized for, e.g. "Slack". */
  platform: string
  createdAt: number
}

const DB_NAME = 'moji-locker'
const STORE = 'gallery'
const AUTO_SAVE_KEY = 'moji.autoSave'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Could not open the gallery'))
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      // Resolve once the transaction commits: a full disk only fails at commit,
      // and the item must not look saved when it isn't.
      tx.oncomplete = () => resolve(req.result)
      tx.onerror = tx.onabort = () => reject(tx.error ?? req.error ?? new Error('Gallery request failed'))
    })
  } finally {
    db.close()
  }
}

/** Newest first. */
export async function listGallery(): Promise<GalleryItem[]> {
  const items = await run<GalleryItem[]>('readonly', (s) => s.getAll())
  return items.sort((a, b) => b.createdAt - a.createdAt)
}

export async function saveToGallery(item: Omit<GalleryItem, 'id' | 'createdAt'>): Promise<GalleryItem> {
  const record = { ...item, createdAt: Date.now() }
  const id = await run<IDBValidKey>('readwrite', (s) => s.add(record))
  return { ...record, id: id as number }
}

export function deleteFromGallery(id: number): Promise<undefined> {
  return run('readwrite', (s) => s.delete(id))
}

export function getAutoSave(): boolean {
  try {
    return localStorage.getItem(AUTO_SAVE_KEY) === '1'
  } catch {
    return false
  }
}

export function setAutoSave(on: boolean) {
  try {
    localStorage.setItem(AUTO_SAVE_KEY, on ? '1' : '0')
  } catch {
    // Private windows can refuse storage; the switch just won't be remembered.
  }
}
