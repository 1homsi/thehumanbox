import { beforeEach, describe, expect, it } from 'vitest'
import { RACING_TICKS_PER_SECOND, isRacing, resetWorldPace, worldPace } from './world-pace'

describe('world pace', () => {
  beforeEach(() => resetWorldPace())

  it('measures ticks per second between two frames', () => {
    worldPace(1000, 0)
    expect(worldPace(1100, 500)).toBe(200)
  })

  it('keeps the last rate while the same frame is read again', () => {
    worldPace(1000, 0)
    worldPace(1100, 500)
    expect(worldPace(1100, 800)).toBe(200)
  })

  it('is not racing at normal speed and is when fast-forwarded', () => {
    worldPace(1000, 0)
    expect(isRacing(1001, 120)).toBe(false)
    resetWorldPace()
    worldPace(1000, 0)
    expect(isRacing(1000 + RACING_TICKS_PER_SECOND, 500)).toBe(true)
  })

  it('stops racing when frames stop arriving', () => {
    worldPace(1000, 0)
    worldPace(1400, 500)
    expect(isRacing(1400, 2100)).toBe(false)
  })

  it('reads a loaded older world as no pace', () => {
    worldPace(5000, 0)
    expect(worldPace(100, 200)).toBe(0)
  })
})
