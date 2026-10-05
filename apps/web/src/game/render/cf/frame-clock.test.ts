import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('wakeEngine', () => {
  let wakeEngine: typeof import('./frame-clock').wakeEngine
  beforeEach(async () => {
    vi.useFakeTimers()
    // The module keeps the time of its last wake-up: start each test from a fresh one, a second in.
    vi.resetModules()
    ;({ wakeEngine } = await import('./frame-clock'))
    vi.advanceTimersByTime(1000)
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  const engine = () => {
    const marks: number[] = []
    return { marks, loop: { markDirty: () => marks.push(performance.now()) } }
  }

  it('wakes the engine once from a task, however many writers ask', () => {
    const e = engine()
    wakeEngine(e)
    wakeEngine(e)
    wakeEngine(e)
    expect(e.marks).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(e.marks).toHaveLength(1)
  })

  it('spaces wake-ups for a slower writer, and lets a faster one bring the next one forward', () => {
    const e = engine()
    wakeEngine(e, 30)
    vi.advanceTimersByTime(1)
    expect(e.marks).toHaveLength(1)
    // 30 per second: the next is about 33 ms after the last.
    wakeEngine(e, 30)
    vi.advanceTimersByTime(20)
    expect(e.marks).toHaveLength(1)
    // A writer that wants 60 per second does not wait for the slower one's slot.
    wakeEngine(e, 60)
    vi.advanceTimersByTime(1)
    expect(e.marks.length).toBeGreaterThanOrEqual(2)
    vi.advanceTimersByTime(40)
    expect(e.marks).toHaveLength(2)
  })

  it('never drops the last request: a wake asked inside the gap still happens', () => {
    const e = engine()
    wakeEngine(e, 30)
    vi.advanceTimersByTime(1)
    wakeEngine(e, 30)
    vi.advanceTimersByTime(100)
    expect(e.marks).toHaveLength(2)
  })
})
