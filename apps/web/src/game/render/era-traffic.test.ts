import { describe, expect, it } from 'vitest'
import {
  LAUNCH_PERIOD,
  LAUNCH_TICKS,
  flightPosition,
  launchProgress,
  drawTrain,
  padEmpty,
} from './era-traffic'

describe('era traffic', () => {
  it('launches each spaceport once a period, and leaves the pad empty a while after', () => {
    let launching = 0
    let empty = 0
    for (let tick = 0; tick < LAUNCH_PERIOD; tick++) {
      if (launchProgress(7, tick) !== null) launching++
      if (padEmpty(7, tick)) empty++
    }
    expect(launching).toBe(LAUNCH_TICKS)
    expect(empty).toBeGreaterThan(LAUNCH_TICKS)
    expect(empty).toBeLessThan(LAUNCH_PERIOD)
  })

  it('staggers neighbouring spaceports', () => {
    const at = (id: number) => [...Array(LAUNCH_PERIOD).keys()].find((t) => launchProgress(id, t) === 0)
    expect(at(1)).not.toBe(at(2))
  })

  it('flies a tribe’s plane through its main settlement', () => {
    const centre = { x: 300, y: 150 }
    const positions = [...Array(3000).keys()]
      .map((t) => flightPosition('lineage-a', centre, t))
      .filter((p): p is NonNullable<typeof p> => p !== null)
    expect(positions.length).toBeGreaterThan(0)
    const closest = Math.min(...positions.map((p) => Math.hypot(p.x - centre.x, p.y - centre.y)))
    expect(closest).toBeLessThan(2)
  })
})

describe('trains', () => {
  /** A context that records every rectangle painted, with its colour. */
  function recorder() {
    const rects: { x: number; y: number; w: number; h: number; fill: string }[] = []
    let fill = ''
    const ctx = {
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      fillRect(x: number, y: number, w: number, h: number) {
        rects.push({ x, y, w, h, fill })
      },
      set fillStyle(v: string) {
        fill = v
      },
      get fillStyle() {
        return fill
      },
    }
    return { ctx: ctx as unknown as CanvasRenderingContext2D, rects }
  }

  it('puffs steam only while it is under way', () => {
    const idle = recorder()
    drawTrain(idle.ctx, 0, 0, [1, 0], 4, false, 0)
    const moving = recorder()
    drawTrain(moving.ctx, 0, 0, [1, 0], 4, true, 0)
    const steam = (r: ReturnType<typeof recorder>) =>
      r.rects.filter((q) => q.fill.startsWith('rgba(210')).length
    expect(steam(idle)).toBe(0)
    expect(steam(moving)).toBeGreaterThan(0)
  })

  it('draws the same engine and cars whichever way it faces', () => {
    const east = recorder()
    drawTrain(east.ctx, 0, 0, [1, 0], 4, false, 0)
    const none = recorder()
    drawTrain(none.ctx, 0, 0, null, 4, false, 0)
    expect(east.rects.length).toBe(none.rects.length)
  })
})
