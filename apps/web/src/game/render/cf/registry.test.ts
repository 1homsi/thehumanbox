import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CfDriver, CfFrame } from './frame'
import { CfRegistry } from './registry'

const frame = {} as CfFrame

/** A driver that takes `ms` of the (mocked) clock and records that it ran. */
function driver(name: string, ms: number, log: string[], clock: { now: number }): CfDriver {
  return {
    update: () => {
      clock.now += ms
      log.push(name)
      return true
    },
  }
}

describe('CfRegistry', () => {
  afterEach(() => vi.restoreAllMocks())

  it('runs every driver when they fit in the frame budget', () => {
    const clock = { now: 0 }
    vi.spyOn(performance, 'now').mockImplementation(() => clock.now)
    const log: string[] = []
    const registry = new CfRegistry(10)
    for (const name of ['a', 'b', 'c']) registry.add(name, driver(name, 2, log, clock))
    expect(registry.update(frame)).toBe(true)
    expect(log).toEqual(['a', 'b', 'c'])
    expect(registry.pending).toBe(false)
  })

  it('leaves the rest for the next frame past the budget, and starts there', () => {
    const clock = { now: 0 }
    vi.spyOn(performance, 'now').mockImplementation(() => clock.now)
    const log: string[] = []
    const registry = new CfRegistry(10)
    registry.add('a', driver('a', 8, log, clock))
    registry.add('b', driver('b', 8, log, clock))
    registry.add('c', driver('c', 1, log, clock))
    registry.update(frame)
    expect(log).toEqual(['a', 'b'])
    expect(registry.pending).toBe(true)
    log.length = 0
    registry.update(frame)
    // `c` first, then round to the start until the budget runs out again.
    expect(log).toEqual(['c', 'a', 'b'])
    expect(registry.pending).toBe(false)
  })

  it('runs them all when asked to ignore the budget (the first paint)', () => {
    const clock = { now: 0 }
    vi.spyOn(performance, 'now').mockImplementation(() => clock.now)
    const log: string[] = []
    const registry = new CfRegistry(10)
    for (const name of ['a', 'b', 'c']) registry.add(name, driver(name, 20, log, clock))
    registry.update(frame, false)
    expect(log).toEqual(['a', 'b', 'c'])
    expect(registry.pending).toBe(false)
  })

  it('always runs at least one driver, however slow', () => {
    const clock = { now: 0 }
    vi.spyOn(performance, 'now').mockImplementation(() => clock.now)
    const log: string[] = []
    const registry = new CfRegistry(10)
    registry.add('slow', driver('slow', 50, log, clock))
    registry.add('next', driver('next', 1, log, clock))
    registry.update(frame)
    registry.update(frame)
    expect(log).toEqual(['slow', 'next', 'slow'])
  })
})
