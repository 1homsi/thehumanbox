const DB_NAME = 'thb-own-world'
const STORE = 'worlds'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'))
  })
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = run(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('indexedDB request failed'))
      }),
  )
}

export interface SavedWorld {
  blob: Uint8Array
  seed: string
  tick: number
  savedAt: number
}

export async function loadWorld(id: string): Promise<SavedWorld | null> {
  try {
    const rec = await tx<SavedWorld | undefined>('readonly', (s) => s.get(id))
    return rec ?? null
  } catch {
    return null
  }
}

export async function saveWorld(id: string, world: SavedWorld): Promise<void> {
  try {
    await tx('readwrite', (s) => s.put(world, id))
  } catch {
    /* noop */
  }
}

export async function deleteWorld(id: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(id))
  } catch {
    /* noop */
  }
}
