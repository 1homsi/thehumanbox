import { describe, expect, it } from 'vitest'
import { FrameSequence } from './frameSequence'

describe('FrameSequence across a server restart', () => {
  it('accepts the restarted server frame ids after a failed snapshot', () => {
    const sequence = new FrameSequence()
    sequence.acceptFrame(10_000, false)

    sequence.beginSnapshotRequest()
    sequence.failSnapshotRequest()

    expect(sequence.lastFrameId).toBe(0)
    expect(sequence.isStale(1)).toBe(false)
  })

  it('retries the snapshot while awaiting a full frame with a cached world', () => {
    const sequence = new FrameSequence()
    sequence.acceptFrame(10_000, false)
    sequence.beginSnapshotRequest()
    sequence.failSnapshotRequest()

    expect(sequence.shouldRetrySnapshot(true)).toBe(true)
  })

  it('stops awaiting a full frame after one is accepted', () => {
    const sequence = new FrameSequence()
    sequence.markAwaitingFullFrame()
    sequence.acceptFrame(1, true)

    expect(sequence.awaitingFullFrame).toBe(false)
    expect(sequence.shouldRetrySnapshot(true)).toBe(false)
  })
})
