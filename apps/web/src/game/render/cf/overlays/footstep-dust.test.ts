import { describe, expect, it } from 'vitest'
import { DUST_POOL, FootstepDust } from './footstep-dust'

const WIN = { x0: 0, y0: 0, x1: 100, y1: 100 }

/** Counts the arcs the puffs draw. */
function arcCounter() {
  let arcs = 0
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    arc() {
      arcs++
    },
    fill() {},
    fillStyle: '',
    globalAlpha: 1,
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, arcs: () => arcs }
}

describe('FootstepDust', () => {
  it('does not dust people who stand still', () => {
    const dust = new FootstepDust()
    dust.observe([{ id: 'a', x: 10, y: 10 }], 0, WIN)
    dust.observe([{ id: 'a', x: 10, y: 10 }], 300, WIN)
    const { ctx, arcs } = arcCounter()
    dust.paint(ctx, 0, 0, 300)
    expect(arcs()).toBe(0)
  })

  it('starts a puff when someone steps, and not for jitter', () => {
    const dust = new FootstepDust()
    dust.observe([{ id: 'a', x: 10, y: 10 }], 0, WIN)
    dust.observe([{ id: 'a', x: 10.01, y: 10 }], 100, WIN)
    const { ctx, arcs } = arcCounter()
    dust.paint(ctx, 0, 0, 100)
    expect(arcs()).toBe(0)
    dust.observe([{ id: 'a', x: 10.5, y: 10 }], 400, WIN)
    dust.paint(ctx, 0, 0, 400)
    expect(arcs()).toBe(1)
  })

  it('spawns at most one puff per person in a short time', () => {
    const dust = new FootstepDust()
    let x = 10
    dust.observe([{ id: 'a', x, y: 10 }], 0, WIN)
    for (let t = 66; t <= 660; t += 66) {
      x += 0.2
      dust.observe([{ id: 'a', x, y: 10 }], t, WIN)
    }
    const { ctx, arcs } = arcCounter()
    dust.paint(ctx, 0, 0, 660)
    // Steps every 66 ms, one puff per 260 ms: the live puffs stay few.
    expect(arcs()).toBeLessThanOrEqual(4)
  })

  it('keeps the pool bounded however many people walk', () => {
    const dust = new FootstepDust()
    const people = Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, x: 10 + i * 0.3, y: 10 }))
    dust.observe(people, 0, WIN)
    for (let k = 1; k < 20; k++) {
      dust.observe(
        people.map((p) => ({ ...p, x: p.x + 0.3 })),
        k * 300,
        WIN,
      )
    }
    const { ctx, arcs } = arcCounter()
    dust.paint(ctx, 0, 0, 19 * 300)
    expect(arcs()).toBeLessThanOrEqual(DUST_POOL)
  })

  it('ignores the dead and people outside the view', () => {
    const dust = new FootstepDust()
    dust.observe([{ id: 'a', x: 10, y: 10, alive: false }], 0, WIN)
    dust.observe([{ id: 'a', x: 10.5, y: 10, alive: false }], 400, WIN)
    dust.observe([{ id: 'b', x: 500, y: 10 }], 0, WIN)
    dust.observe([{ id: 'b', x: 500.5, y: 10 }], 400, WIN)
    const { ctx, arcs } = arcCounter()
    dust.paint(ctx, 0, 0, 400)
    expect(arcs()).toBe(0)
  })
})
