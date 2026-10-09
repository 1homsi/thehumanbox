import { describe, expect, it } from 'vitest'
import { ANIMAL_DUST, DUST_LIFE_MS, FootstepDust, PEOPLE_DUST } from './footstep-dust'

const win = { x0: -100, y0: -100, x1: 100, y1: 100 }

/** A context that counts the puffs (arcs) it is asked to draw. */
function countingContext() {
  const log = { arcs: 0, radii: [] as number[] }
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    fill() {},
    globalAlpha: 1,
    fillStyle: '',
    arc(_x: number, _y: number, r: number) {
      log.arcs++
      log.radii.push(r)
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log }
}

describe('animal footstep dust', () => {
  it('is smaller and paler than the dust a person kicks up', () => {
    expect(ANIMAL_DUST.radius).toBeLessThan(PEOPLE_DUST.radius)
    expect(ANIMAL_DUST.alpha).toBeLessThan(PEOPLE_DUST.alpha)
    expect(ANIMAL_DUST.colour).not.toBe(PEOPLE_DUST.colour)
  })

  it('puffs where an animal moved, and not where it stood still', () => {
    const dust = new FootstepDust(ANIMAL_DUST)
    dust.observe([{ id: '7', x: 10, y: 10 }], 0, win)
    dust.observe([{ id: '7', x: 10, y: 10 }], 100, win)
    const still = countingContext()
    dust.paint(still.ctx, 0, 0, 100)
    expect(still.log.arcs).toBe(0)

    dust.observe([{ id: '7', x: 11, y: 10 }], 400, win)
    const moved = countingContext()
    dust.paint(moved.ctx, 0, 0, 450)
    expect(moved.log.arcs).toBe(1)
    // A new puff starts at the small radius and grows to the animal style's radius.
    expect(moved.log.radii[0]).toBeGreaterThanOrEqual(1)
    expect(moved.log.radii[0]).toBeLessThan(1 + ANIMAL_DUST.radius)
    const gone = countingContext()
    dust.paint(gone.ctx, 0, 0, 400 + DUST_LIFE_MS + 1)
    expect(gone.log.arcs).toBe(0)
  })
})
