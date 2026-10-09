import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import type { CfFrame } from './frame'
import { hazeLevels, paintHaze } from './haze'

function world(extra: Record<string, unknown>): WorldState {
  return {
    is_day: true,
    day_progress: 0.5,
    weather: { kind: 'clear', intensity: 0 },
    drought: false,
    ...extra,
  } as unknown as WorldState
}

describe('hazeLevels', () => {
  it('is thickest at dawn and gone by mid-morning', () => {
    const dawn = hazeLevels(world({ day_progress: 0.02 })).fog
    const morning = hazeLevels(world({ day_progress: 0.3 })).fog
    expect(dawn).toBeGreaterThan(0.6)
    expect(morning).toBe(0)
  })

  it('lingers a little at dusk and at night', () => {
    expect(hazeLevels(world({ day_progress: 0.95 })).fog).toBeGreaterThan(0)
    expect(hazeLevels(world({ is_day: false, day_progress: 0.5 })).fog).toBeCloseTo(0.35, 5)
  })

  it('thickens after rain and while it is wet', () => {
    expect(hazeLevels(world({ day_progress: 0.5, weather: { kind: 'wet', intensity: 0 } })).fog).toBe(0.5)
    expect(hazeLevels(world({ day_progress: 0.5, weather: { kind: 'rain', intensity: 0.5 } })).fog).toBe(0.25)
  })

  it('shows dust only in drought', () => {
    expect(hazeLevels(world({ drought: false })).dust).toBe(0)
    expect(hazeLevels(world({ drought: true })).dust).toBeGreaterThan(0)
  })

  it('never exceeds 1', () => {
    expect(hazeLevels(world({ day_progress: 0, is_day: false })).fog).toBeLessThanOrEqual(1)
  })
})

describe('paintHaze', () => {
  // A world 400 tiles square, at night (fog everywhere), camera at the middle of it.
  const W = 400 * 16
  const H = 400 * 16
  const frame = (cam: { x: number; y: number }, viewport: { w: number; h: number }) =>
    ({
      W,
      H,
      zoom: 2,
      cam,
      viewport,
      ox: 0,
      oy: 0,
      world: { weather: { wind_x: 0.3 } },
    }) as unknown as CfFrame

  /** The centres of every bank painted (each bank is one ellipse). */
  function banks(f: CfFrame, t: number): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = []
    const ctx = {
      save() {},
      restore() {},
      beginPath() {},
      fill() {},
      fillStyle: '',
      createRadialGradient() {
        return { addColorStop() {} }
      },
      ellipse(x: number, y: number) {
        out.push({ x, y })
      },
    }
    paintHaze(ctx as unknown as CanvasRenderingContext2D, f, { fog: 1, dust: 0 }, t)
    return out
  }

  it('paints only the banks that can reach the camera, and every one of them', () => {
    const t = 1234
    const whole = banks(frame({ x: W / 2, y: H / 2 }, { w: 1e6, h: 1e6 }), t)
    const cam = { x: W / 2, y: H / 2 }
    const view = { w: 1280, h: 800 }
    const near = banks(frame(cam, view), t)
    const hw = view.w / 2 / 2 + TILE * 2
    const hh = view.h / 2 / 2 + TILE * 2
    // Every bank whose centre is in the view is painted.
    const inside = whole.filter((b) => Math.abs(b.x - cam.x) <= hw && Math.abs(b.y - cam.y) <= hh)
    for (const b of inside) expect(near).toContainEqual(b)
    // And far fewer banks than the world holds.
    expect(near.length).toBeLessThan(whole.length / 4)
  })
})
