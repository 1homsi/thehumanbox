import { describe, expect, it } from 'vitest'
import {
  BAT_COUNT,
  FLOCK_COUNT,
  batAt,
  batStrength,
  birdStrength,
  flockAt,
  paintBats,
  paintBirdFlocks,
  type FlyerWindow,
} from './sky-flyers'

const WORLD = { W: 2000, H: 1400 }
const VIEW: FlyerWindow = { x0: 300, y0: 200, x1: 700, y1: 500 }
const DAY = { is_day: true, day_progress: 0.3, weather: { kind: 'clear', intensity: 0 } }
const NIGHT = { is_day: false, day_progress: 0.9, weather: { kind: 'clear', intensity: 0 } }

/** A canvas stand-in that counts the calls the painters make. */
function spy() {
  const calls: Record<string, number> = {}
  const count = (k: string) => {
    calls[k] = (calls[k] ?? 0) + 1
  }
  const ctx = {
    save: () => count('save'),
    restore: () => count('restore'),
    beginPath: () => count('beginPath'),
    moveTo: () => count('moveTo'),
    lineTo: () => count('lineTo'),
    stroke: () => count('stroke'),
    globalAlpha: 1,
    strokeStyle: '',
    lineWidth: 1,
    lineCap: '',
    lineJoin: '',
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

describe('birdStrength', () => {
  it('is full through the middle of a clear day and zero at night', () => {
    expect(birdStrength(DAY)).toBe(1)
    expect(birdStrength(NIGHT)).toBe(0)
  })

  it('fades in after first light and settles as the sun goes down', () => {
    const dawn = birdStrength({ ...DAY, day_progress: 0.05 })
    const dusk = birdStrength({ ...DAY, day_progress: 0.58 })
    expect(dawn).toBeGreaterThan(0)
    expect(dawn).toBeLessThan(1)
    expect(dusk).toBeGreaterThan(0)
    expect(dusk).toBeLessThan(1)
  })

  it('keeps them down in a storm and thins them in rain', () => {
    const storm = birdStrength({ ...DAY, weather: { kind: 'storm', intensity: 0.8 } })
    const rain = birdStrength({ ...DAY, weather: { kind: 'rain', intensity: 0.5 } })
    expect(storm).toBeLessThan(rain)
    expect(rain).toBeLessThan(birdStrength(DAY))
  })
})

describe('batStrength', () => {
  it('fills the night and comes out at dusk in daylight', () => {
    expect(batStrength(NIGHT)).toBe(1)
    expect(batStrength(DAY)).toBe(0)
    expect(batStrength({ ...DAY, day_progress: 0.6 })).toBeGreaterThan(0)
  })

  it('stays in when there is a storm', () => {
    expect(batStrength({ ...NIGHT, weather: { kind: 'storm', intensity: 1 } })).toBe(0)
  })
})

describe('flockAt', () => {
  it('moves the flock along its heading over time, and wraps it inside the wider world', () => {
    for (let f = 0; f < FLOCK_COUNT; f++) {
      for (let t = 0; t < 600_000; t += 7_919) {
        const { x, y } = flockAt(f, t, WORLD)
        expect(x).toBeGreaterThanOrEqual(-60)
        expect(x).toBeLessThanOrEqual(WORLD.W + 60)
        expect(y).toBeGreaterThan(-10)
        expect(y).toBeLessThan(WORLD.H + 10)
      }
    }
  })

  it('is the same for the same flock and moment', () => {
    expect(flockAt(2, 5000, WORLD)).toEqual(flockAt(2, 5000, WORLD))
  })
})

describe('batAt', () => {
  it('circles within a few tiles of its home and keeps its wings in a small range', () => {
    for (let b = 0; b < BAT_COUNT; b++) {
      const a = batAt(b, 1000, WORLD)
      const c = batAt(b, 9000, WORLD)
      expect(Math.hypot(a.x - c.x, a.y - c.y)).toBeLessThan(60)
      expect(a.wing).toBeGreaterThanOrEqual(1.8)
      expect(a.wing).toBeLessThanOrEqual(3)
    }
  })
})

describe('painters', () => {
  it('draw nothing when the strength is zero', () => {
    const { ctx, calls } = spy()
    paintBirdFlocks(ctx, WORLD, VIEW, 1234, 0)
    paintBats(ctx, WORLD, VIEW, 1234, 0)
    expect(calls.stroke ?? 0).toBe(0)
  })

  it('stroke a V for each bird in view and a W for each bat in view', () => {
    const birds = spy()
    paintBirdFlocks(birds.ctx, WORLD, { x0: 0, y0: 0, x1: WORLD.W, y1: WORLD.H }, 4000, 1)
    expect(birds.calls.stroke).toBeGreaterThan(0)
    expect(birds.calls.stroke).toBeLessThanOrEqual(FLOCK_COUNT * 5)
    expect(birds.calls.save).toBe(birds.calls.restore)

    const bats = spy()
    paintBats(bats.ctx, WORLD, { x0: 0, y0: 0, x1: WORLD.W, y1: WORLD.H }, 4000, 1)
    expect(bats.calls.stroke).toBe(BAT_COUNT)
    expect(bats.calls.moveTo).toBe(BAT_COUNT)
  })

  it('skip flyers far outside the view', () => {
    const { ctx, calls } = spy()
    paintBats(ctx, WORLD, { x0: 1900, y0: 1300, x1: 1950, y1: 1350 }, 4000, 1)
    expect(calls.stroke ?? 0).toBeLessThan(BAT_COUNT)
  })
})
