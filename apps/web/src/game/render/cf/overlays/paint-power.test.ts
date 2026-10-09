import { describe, expect, it } from 'vitest'
import { paintPower, powerNetwork } from './paint-power'
import type { CfFrame } from './frame'

/** Counts the rectangles and arcs drawn, and the wires stroked. */
function recorder() {
  const rects: [number, number, number, number][] = []
  let arcs = 0
  let strokes = 0
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    fill() {},
    stroke() {
      strokes++
    },
    arc() {
      arcs++
    },
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push([x, y, w, h])
    },
  } as unknown as CanvasRenderingContext2D
  return { ctx, rects, arcs: () => arcs, strokes: () => strokes }
}

const building = (lineage: string, x: number, y: number) => ({
  id: x * 100 + y,
  kind: 'house',
  x,
  y,
  lineage_id: lineage,
})

function frame(buildings: unknown[], isDay: boolean, eras: Record<string, string>): CfFrame {
  return {
    world: { buildings, lineage_eras: eras, is_day: isDay },
    ox: 0,
    oy: 0,
    bounds: { c0: 0, c1: 200, r0: 0, r1: 200 },
  } as unknown as CfFrame
}

describe('power network', () => {
  it('wires each pole to its two nearest neighbours in reach, once', () => {
    const poles = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 6, y: 0 },
      { x: 40, y: 40 },
    ]
    const edges = powerNetwork(poles)
      .map(([a, b]) => `${a}-${b}`)
      .sort()
    expect(edges).toEqual(['0-1', '0-2', '1-2'])
  })

  it('leaves a lone pole unwired', () => {
    expect(
      powerNetwork([
        { x: 0, y: 0 },
        { x: 50, y: 50 },
      ]),
    ).toEqual([])
  })
})

describe('power poles', () => {
  it('stand only at the buildings of industrial and later tribes', () => {
    const buildings = [building('red', 10, 10), building('red', 12, 10), building('blue', 30, 30)]
    const old = recorder()
    paintPower(old.ctx, frame(buildings, true, { red: 'bronze', blue: 'stone' }))
    expect(old.rects.length).toBe(0)
    const modern = recorder()
    paintPower(modern.ctx, frame(buildings, true, { red: 'industrial', blue: 'stone' }))
    expect(modern.rects.length).toBe(2 * 2)
    expect(modern.strokes()).toBe(1)
  })

  it('lights a lamp on each pole at night only', () => {
    const buildings = [building('red', 10, 10)]
    const day = recorder()
    paintPower(day.ctx, frame(buildings, true, { red: 'modern' }))
    expect(day.arcs()).toBe(0)
    const night = recorder()
    paintPower(night.ctx, frame(buildings, false, { red: 'modern' }))
    expect(night.arcs()).toBe(1)
  })

  it('skips buildings that are ruined or still going up', () => {
    const buildings = [
      { ...building('red', 10, 10), ruined: true },
      { ...building('red', 14, 10), construction_progress: 0.4 },
      building('red', 18, 10),
    ]
    const rec = recorder()
    paintPower(rec.ctx, frame(buildings, true, { red: 'industrial' }))
    expect(rec.rects.length).toBe(2)
  })
})
