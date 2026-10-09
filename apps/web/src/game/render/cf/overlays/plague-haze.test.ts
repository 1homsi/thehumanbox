import { describe, expect, it } from 'vitest'
import { TILE } from '../../../model/palette'
import {
  PLAGUE_MIN_INFECTION,
  PLAGUE_SPOT_LIMIT,
  paintPlagueHaze,
  plagueSpot,
  type PlagueOrganism,
} from './plague-haze'

/** Records every circle drawn. */
function recordingContext() {
  const arcs: { x: number; y: number; r: number; alpha: number }[] = []
  const ctx = {
    save() {},
    restore() {},
    globalAlpha: 1,
    fillStyle: '',
    beginPath() {},
    fill() {},
    arc(x: number, y: number, r: number) {
      arcs.push({ x, y, r, alpha: this.globalAlpha })
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, arcs }
}

const VIEW = { c0: 0, c1: 50, r0: 0, r1: 50 }

function person(x: number, y: number, infection: number, alive = true): PlagueOrganism {
  return { x, y, alive, infection }
}

describe('plagueSpot', () => {
  it('gives no cloud to a healthy, dead or barely infected person', () => {
    expect(plagueSpot(person(5, 5, 0), 0)).toBeNull()
    expect(plagueSpot(person(5, 5, 0.9, false), 0)).toBeNull()
    expect(plagueSpot(person(5, 5, PLAGUE_MIN_INFECTION - 0.01), 0)).toBeNull()
  })

  it('gives a cloud that grows with the infection', () => {
    const mild = plagueSpot(person(5, 5, 0.2), 1000)
    const severe = plagueSpot(person(5, 5, 0.9), 1000)
    expect(mild).not.toBeNull()
    expect(severe).not.toBeNull()
    expect(severe!.r).toBeGreaterThan(mild!.r)
    expect(severe!.strength).toBeGreaterThan(mild!.strength)
    expect(severe!.strength).toBeLessThanOrEqual(1)
  })

  it('swells and sinks on the clock, but is the same at the same moment', () => {
    const p = person(7, 9, 0.5)
    expect(plagueSpot(p, 500)).toEqual(plagueSpot(p, 500))
    expect(plagueSpot(p, 500)!.r).not.toBe(plagueSpot(p, 1900)!.r)
  })
})

describe('paintPlagueHaze', () => {
  it('paints two circles per sick person in the view, and none for the healthy', () => {
    const { ctx, arcs } = recordingContext()
    const people = [person(10, 10, 0.6), person(20, 20, 0), person(30, 30, 0.4)]
    paintPlagueHaze(ctx, people, VIEW, 0, 0, 0)
    expect(arcs).toHaveLength(4)
  })

  it('skips the sick who are far outside the window', () => {
    const { ctx, arcs } = recordingContext()
    paintPlagueHaze(ctx, [person(500, 500, 0.9)], VIEW, 0, 0, 0)
    expect(arcs).toHaveLength(0)
  })

  it('places the cloud on the person, shifted by the view origin', () => {
    const { ctx, arcs } = recordingContext()
    paintPlagueHaze(ctx, [person(12, 14, 0.7)], { c0: 10, c1: 30, r0: 10, r1: 30 }, 10, 10, 0)
    expect(arcs[0].x).toBeCloseTo(2 * TILE + TILE / 2, 6)
    expect(arcs[0].y).toBeCloseTo(4 * TILE + TILE / 2, 6)
  })

  it('caps the number of clouds in one pass', () => {
    const { ctx, arcs } = recordingContext()
    const crowd = Array.from({ length: PLAGUE_SPOT_LIMIT + 200 }, (_, i) => person(i % 40, (i / 40) | 0, 0.5))
    paintPlagueHaze(ctx, crowd, { c0: 0, c1: 60, r0: 0, r1: 60 }, 0, 0, 0)
    expect(arcs.length).toBe(PLAGUE_SPOT_LIMIT * 2)
  })
})
