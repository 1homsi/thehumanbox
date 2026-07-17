const DB_NAME = 'thb-own-world'
const STORE = 'worlds'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => {
        db.close()
        if (dbPromise === opening) dbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => {
      if (dbPromise === opening) dbPromise = null
      reject(req.error ?? new Error('indexedDB open failed'))
    }
    req.onblocked = () => {
      if (dbPromise === opening) dbPromise = null
      reject(new Error('indexedDB open blocked by another tab'))
    }
  })
  dbPromise = opening
  return opening
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        let result: T
        let req: IDBRequest<T>
        try {
          req = run(t.objectStore(STORE))
        } catch (error) {
          t.abort()
          reject(error)
          return
        }
        req.onsuccess = () => {
          result = req.result
        }
        req.onerror = () => reject(req.error ?? new Error('indexedDB request failed'))
        // A write request can report success before its transaction has
        // actually committed. Waiting for `complete` makes a resolved save
        // durable even if the worker is stopped immediately afterwards.
        t.oncomplete = () => resolve(result)
        t.onerror = () => reject(t.error ?? new Error('indexedDB transaction failed'))
        t.onabort = () => reject(t.error ?? new Error('indexedDB transaction aborted'))
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
  const rec = await tx<SavedWorld | undefined>('readonly', (s) => s.get(id))
  return rec ?? null
}

export async function saveWorld(id: string, world: SavedWorld): Promise<void> {
  await tx('readwrite', (s) => s.put(world, id))
}

export async function deleteWorld(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id))
}
