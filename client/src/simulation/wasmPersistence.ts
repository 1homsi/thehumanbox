export type StorageRetry<SavedWorld> =
  | { kind: 'read' }
  | { kind: 'reset'; seed: string }
  | { kind: 'restore'; recoveryId: string }
  | { kind: 'preserve'; world: SavedWorld; recoveryId: string }

const RETRY_PRIORITY: Record<StorageRetry<unknown>['kind'], number> = {
  read: 1,
  preserve: 2,
  restore: 3,
  reset: 4,
}

export function rememberStorageRetry<SavedWorld>(
  current: StorageRetry<SavedWorld> | null,
  next: StorageRetry<SavedWorld>,
): StorageRetry<SavedWorld> {
  if (current && RETRY_PRIORITY[current.kind] >= RETRY_PRIORITY[next.kind]) return current
  return next
}

export interface StorageRetryOperations<SavedWorld> {
  persist: () => Promise<boolean>
  read: () => Promise<boolean>
  reset: (seed: string) => Promise<boolean>
  restore: (recoveryId: string) => Promise<boolean>
  preserve: (world: SavedWorld, recoveryId: string) => Promise<boolean>
}

export function runStorageRetry<SavedWorld>(
  storageReady: boolean,
  retry: StorageRetry<SavedWorld> | null,
  operations: StorageRetryOperations<SavedWorld>,
): Promise<boolean> {
  if (storageReady) return operations.persist()
  if (!retry) return Promise.resolve(false)

  switch (retry.kind) {
    case 'read':
      return operations.read()
    case 'reset':
      return operations.reset(retry.seed)
    case 'restore':
      return operations.restore(retry.recoveryId)
    case 'preserve':
      return operations.preserve(retry.world, retry.recoveryId)
  }
}

export function localSaveWorkerRequest(status: {
  phase: string
  retryable?: boolean
}): 'save' | 'retry_storage' {
  return status.phase === 'error' && status.retryable === true ? 'retry_storage' : 'save'
}

export function findRequestedRecovery<T extends { id: string }>(
  recoveryId: string,
  recoveries: readonly T[],
): T | null {
  return recoveries.find((recovery) => recovery.id === recoveryId) ?? null
}
