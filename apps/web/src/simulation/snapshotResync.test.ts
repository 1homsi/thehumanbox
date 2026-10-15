import { describe, expect, it } from 'vitest'
import { failedSnapshotFrameId, shouldRetrySnapshot } from './snapshotResync'

describe('snapshot resync after a server reset', () => {
  it('does not restore a stale frame id when snapshot fetch fails', () => {
    expect(failedSnapshotFrameId()).toBe(0)
  })

  it('retries when a full frame is still required despite an existing world', () => {
    expect(shouldRetrySnapshot(true, true)).toBe(true)
  })
})
