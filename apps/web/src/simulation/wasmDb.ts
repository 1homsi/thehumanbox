const DB_NAME = 'thb-own-world'
const STORE = 'worlds'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null
const MAX_DB_ATTEMPTS = 3

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  let abandoned = false
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
      // `blocked` rejects immediately so the UI can offer a retry, but the
      // browser may still complete that original open request later. Close
      // the orphaned connection or it can block the retry/next upgrade even
      // though no caller can ever receive it.
      if (abandoned || dbPromise !== opening) {
        db.close()
        return
      }
      db.onversionchange = () => {
        db.close()
        if (dbPromise === opening) dbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => {
      if (abandoned) return
      abandoned = true
      if (dbPromise === opening) dbPromise = null
      reject(req.error ?? new Error('indexedDB open failed'))
    }
    req.onblocked = () => {
      abandoned = true
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

function shouldRetry(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false
  return ['AbortError', 'InvalidStateError', 'TransactionInactiveError', 'UnknownError'].includes(error.name)
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_DB_ATTEMPTS; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (!shouldRetry(error) || attempt === MAX_DB_ATTEMPTS) throw error
      dbPromise = null
      await new Promise((resolve) => setTimeout(resolve, 40 * attempt))
    }
  }
  throw lastError
}

export interface SavedWorld {
  blob: Uint8Array
  seed: string
  tick: number
  savedAt: number
}

export interface RecoveryWorld {
  id: string
  seed: string
  tick: number
  savedAt: number
  bytes: number
}

export function recoveryPrefix(id: string): string {
  return `${id}:recovery:`
}

export async function loadWorld(id: string): Promise<SavedWorld | null> {
  const rec = await withRetry(() => tx<SavedWorld | undefined>('readonly', (s) => s.get(id)))
  return rec ?? null
}

export async function saveWorld(id: string, world: SavedWorld): Promise<void> {
  await withRetry(() => tx('readwrite', (s) => s.put(world, id)))
}

export async function deleteWorld(id: string): Promise<void> {
  await withRetry(() => tx('readwrite', (s) => s.delete(id)))
}

export async function archiveAndDeleteWorld(id: string): Promise<string | null> {
  return withRetry(() =>
    openDb().then(
      (db) =>
        new Promise<string | null>((resolve, reject) => {
          const transaction = db.transaction(STORE, 'readwrite')
          const store = transaction.objectStore(STORE)
          const get = store.get(id) as IDBRequest<SavedWorld | undefined>
          let recoveryId: string | null = null
          get.onerror = () => reject(get.error ?? new Error('could not read world before reset'))
          get.onsuccess = () => {
            if (!get.result) return
            recoveryId = `${recoveryPrefix(id)}${Date.now()}:reset`
            store.put(get.result, recoveryId)
            store.delete(id)
          }
          transaction.oncomplete = () => resolve(recoveryId)
          transaction.onerror = () => reject(transaction.error ?? new Error('world reset transaction failed'))
          transaction.onabort = () =>
            reject(transaction.error ?? new Error('world reset transaction aborted'))
        }),
    ),
  )
}

export async function listRecoveryWorlds(id: string): Promise<RecoveryWorld[]> {
  const keys = await withRetry(() => tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys()))
  const prefix = recoveryPrefix(id)
  const recoveryIds = keys
    .filter((key): key is string => typeof key === 'string' && key.startsWith(prefix))
    .sort()
    .reverse()
    .slice(0, 20)
  const records = await Promise.all(
    recoveryIds.map(async (recoveryId) => ({ recoveryId, world: await loadWorld(recoveryId) })),
  )
  return records.flatMap(({ recoveryId, world }) =>
    world
      ? [
          {
            id: recoveryId,
            seed: world.seed,
            tick: world.tick,
            savedAt: world.savedAt,
            bytes: world.blob.byteLength,
          },
        ]
      : [],
  )
}

export async function restoreRecoveryWorld(id: string, recoveryId: string): Promise<string | null> {
  if (!recoveryId.startsWith(recoveryPrefix(id))) throw new Error('invalid recovery save id')
  return withRetry(() =>
    openDb().then(
      (db) =>
        new Promise<string | null>((resolve, reject) => {
          const transaction = db.transaction(STORE, 'readwrite')
          const store = transaction.objectStore(STORE)
          const getRecovery = store.get(recoveryId) as IDBRequest<SavedWorld | undefined>
          const getPrimary = store.get(id) as IDBRequest<SavedWorld | undefined>
          let readsComplete = 0
          let primaryBackupId: string | null = null
          const apply = () => {
            readsComplete += 1
            if (readsComplete !== 2) return
            if (!getRecovery.result) {
              transaction.abort()
              reject(new Error('recovery save no longer exists'))
              return
            }
            if (getPrimary.result) {
              primaryBackupId = `${recoveryPrefix(id)}${Date.now()}:before-restore`
              store.put(getPrimary.result, primaryBackupId)
            }
            store.put(getRecovery.result, id)
          }
          getRecovery.onerror = () => reject(getRecovery.error ?? new Error('could not read recovery save'))
          getPrimary.onerror = () => reject(getPrimary.error ?? new Error('could not read active save'))
          getRecovery.onsuccess = apply
          getPrimary.onsuccess = apply
          transaction.oncomplete = () => resolve(primaryBackupId)
          transaction.onerror = () => reject(transaction.error ?? new Error('recovery transaction failed'))
          transaction.onabort = () => reject(transaction.error ?? new Error('recovery transaction aborted'))
        }),
    ),
  )
}
