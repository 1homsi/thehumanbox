import { describe, expect, it, vi } from 'vitest'
import {
  findRequestedRecovery,
  localSaveWorkerRequest,
  rememberStorageRetry,
  runStorageRetry,
  type StorageRetryOperations,
} from './wasmPersistence'

function operations(): StorageRetryOperations<{ tick: number }> {
  return {
    persist: vi.fn(async () => true),
    read: vi.fn(async () => true),
    reset: vi.fn(async () => true),
    restore: vi.fn(async () => true),
    preserve: vi.fn(async () => true),
  }
}

describe('local WASM storage retries', () => {
  it('routes retryable save errors through storage recovery instead of a blind overwrite', () => {
    expect(localSaveWorkerRequest({ phase: 'error', retryable: true })).toBe('retry_storage')
    expect(localSaveWorkerRequest({ phase: 'saved' })).toBe('save')
    expect(localSaveWorkerRequest({ phase: 'error', retryable: false })).toBe('save')
  })

  it('keeps an explicit reset pending when its fallback read also fails', () => {
    const pending = rememberStorageRetry(null, { kind: 'reset', seed: '73' })
    expect(rememberStorageRetry(pending, { kind: 'read' })).toEqual({ kind: 'reset', seed: '73' })
  })

  it('keeps an explicit recovery pending while separately retrying its fallback read', () => {
    const pending = rememberStorageRetry<{ tick: number }>(null, {
      kind: 'restore',
      recoveryId: 'recovery-1',
    })
    expect(rememberStorageRetry(pending, { kind: 'read' })).toEqual({
      kind: 'restore',
      recoveryId: 'recovery-1',
    })
  })

  it('rechecks the requested recovery without silently selecting another save', () => {
    const recoveries = [{ id: 'recovery-1' }, { id: 'recovery-2' }]
    expect(findRequestedRecovery('recovery-2', recoveries)).toEqual({ id: 'recovery-2' })
    expect(findRequestedRecovery('deleted-recovery', recoveries)).toBeNull()
  })

  it('lets an unreadable save advance from read retry to preservation retry', () => {
    const pending = rememberStorageRetry<{ tick: number }>(null, { kind: 'read' })
    expect(
      rememberStorageRetry(pending, {
        kind: 'preserve',
        world: { tick: 42 },
        recoveryId: 'browser-own:recovery:42',
      }),
    ).toEqual({
      kind: 'preserve',
      world: { tick: 42 },
      recoveryId: 'browser-own:recovery:42',
    })
  })

  it.each([
    ['read', { kind: 'read' } as const, 'read'],
    ['reset', { kind: 'reset', seed: '73' } as const, 'reset'],
    ['restore', { kind: 'restore', recoveryId: 'recovery-1' } as const, 'restore'],
    ['preserve', { kind: 'preserve', world: { tick: 42 }, recoveryId: 'recovery-2' } as const, 'preserve'],
  ])('retries a failed %s operation in the current worker', async (_label, retry, expected) => {
    const ops = operations()
    await expect(runStorageRetry(false, retry, ops)).resolves.toBe(true)
    expect(ops[expected as keyof StorageRetryOperations<{ tick: number }>]).toHaveBeenCalledOnce()
    expect(ops.persist).not.toHaveBeenCalled()
  })

  it('retries persistence directly when storage access is already safe', async () => {
    const ops = operations()
    await expect(runStorageRetry(true, { kind: 'read' }, ops)).resolves.toBe(true)
    expect(ops.persist).toHaveBeenCalledOnce()
    expect(ops.read).not.toHaveBeenCalled()
  })
})
