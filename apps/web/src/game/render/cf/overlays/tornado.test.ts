import { describe, expect, it } from 'vitest'
import { TORNADO_MS, TORNADO_SLOT_MS, paintTornado, tornadoAt, tornadoStrength } from './tornado'

const VIEW = { cx: 400, cy: 300, hw: 200, hh: 150 }

describe('tornadoAt', () => {
  it('never appears in a weak storm', () => {
    for (let t = 0; t < TORNADO_SLOT_MS * 50; t += 500) expect(tornadoAt(t, 0.4, VIEW)).toBeNull()
  })

  it('is deterministic and stays inside the view for the most part', () => {
    let seen = 0
    for (let t = 0; t < TORNADO_SLOT_MS * 60; t += 250) {
      const a = tornadoAt(t, 1, VIEW)
      expect(tornadoAt(t, 1, VIEW)).toEqual(a)
      if (a) {
        seen++
        expect(Math.abs(a.y - VIEW.cy)).toBeLessThanOrEqual(VIEW.hh * 0.56 + 1e-9)
      }
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('appears less often than storms strike lightning', () => {
    let n = 0
    for (let t = 0; t < TORNADO_SLOT_MS * 200; t += 250) if (tornadoAt(t, 1, VIEW)) n++
    // A tornado lasts about 9 of every 24 s, in about a third of the slots.
    expect(n * 250).toBeLessThan(TORNADO_MS * 200)
  })
})

describe('tornadoStrength', () => {
  it('fades in and out at the ends and is zero outside its life', () => {
    expect(tornadoStrength(0)).toBeCloseTo(0, 5)
    expect(tornadoStrength(TORNADO_MS / 2)).toBeCloseTo(1, 5)
    expect(tornadoStrength(-1)).toBe(0)
    expect(tornadoStrength(TORNADO_MS)).toBe(0)
  })
})

describe('paintTornado', () => {
  it('draws nothing when it has faded out', () => {
    let calls = 0
    const ctx = {
      save() {},
      restore() {},
      beginPath() {},
      ellipse() {
        calls++
      },
      fillRect() {
        calls++
      },
      fill() {},
      fillStyle: '',
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D
    paintTornado(ctx, { age: 0, x: 0, y: 0 }, 1000)
    expect(calls).toBe(0)
    paintTornado(ctx, { age: TORNADO_MS / 2, x: 0, y: 0 }, 1000)
    expect(calls).toBeGreaterThan(0)
  })
})
