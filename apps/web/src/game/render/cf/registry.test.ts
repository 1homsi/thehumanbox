import { afterEach, describe, expect, it, vi } from 'vitest'
import { CfRegistry } from './registry'
import type { CfDriver, CfFrame } from './frame'

const frame = (terrainRevision: number) => ({ terrainRevision, deadline: Infinity }) as unknown as CfFrame

/** Pretends each update costs `ms` of wall time. */
function costly(clock: { now: number }, ms: number, log: string[], name: string): CfDriver {
  return {
    update() {
      log.push(name)
      clock.now += ms
      return true
    },
  }
}

describe('CfRegistry rebuild budget', () => {
  const clock = { now: 0 }
  afterEach(() => vi.restoreAllMocks())

  function setup() {
    clock.now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock.now)
    return new CfRegistry()
  }

  it('runs every driver in one step while the terrain is being built for the first time', () => {
    const registry = setup()
    const log: string[] = []
    for (const name of ['shore', 'foam', 'vegetation']) registry.add(name, costly(clock, 20, log, name))
    registry.update(frame(1))
    expect(log).toEqual(['shore', 'foam', 'vegetation'])
  })

  it('spreads a later terrain change over steps, and never starves a driver', () => {
    const registry = setup()
    const log: string[] = []
    for (const name of ['shore', 'foam', 'vegetation']) registry.add(name, costly(clock, 4, log, name))
    registry.add('roads', costly(clock, 4, log, 'roads'))
    expect(registry.update(frame(2))).toBe(true)
    // 4 ms each, 6 ms budget: shore and foam start inside it, vegetation waits; roads always run.
    expect(log).toEqual(['shore', 'foam', 'roads'])
    log.length = 0
    registry.update(frame(2))
    expect(log).toContain('vegetation')
    expect(log[0]).toBe('shore')
  })

  it('runs a driver put off, or one that reported more work, in the next step whatever the budget', () => {
    const registry = setup()
    const log: string[] = []
    const partial: CfDriver = {
      pending: true,
      update() {
        log.push('vegetation')
        clock.now += 1
        this.pending = false
        return true
      },
    }
    registry.add('shore', costly(clock, 10, log, 'shore'))
    registry.add('foam', costly(clock, 1, log, 'foam'))
    registry.add('vegetation', partial)
    registry.update(frame(2))
    // Shore ate the budget: foam and vegetation wait for the next step.
    expect(log).toEqual(['shore'])
    log.length = 0
    registry.update(frame(2))
    expect(log).toEqual(['shore', 'foam', 'vegetation'])
  })
})
