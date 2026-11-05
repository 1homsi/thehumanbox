// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { CLOUD_CELL, cloudRuns, drawCloudShape, drawClouds } from './decorations'

/** The cells a list of runs covers. */
const covered = (runs: readonly (readonly [number, number, number])[]) =>
  runs.flatMap(([r, c, n]) => Array.from({ length: n }, (_, i) => `${r},${c + i}`))

function recorder() {
  const fills: { style: string; rect: [number, number, number, number] }[] = []
  const ctx = {
    fillStyle: '',
    save() {},
    restore() {},
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ style: this.fillStyle, rect: [x, y, w, h] })
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills }
}

describe('cloud shadows in flat pixel art (#883)', () => {
  it('covers an ellipse on both sides of its centre, cells left of the anchor included', () => {
    const cells = covered(cloudRuns([{ x: 0, y: 0, rx: 100, ry: 40 }], 1))
    const cols = cells.map((k) => Number(k.split(',')[1]))
    expect(Math.min(...cols)).toBeLessThan(-8)
    expect(Math.max(...cols)).toBeGreaterThan(8)
    // Runs on a row never overlap, so one translucent tone stays flat.
    expect(new Set(cells).size).toBe(cells.length)
  })

  it('draws two tones on the tile grid, the core inside the outline', () => {
    const { ctx, fills } = recorder()
    drawCloudShape(ctx, 1003, 517, 900, 250, 1, '1,2,3', 10)
    expect(new Set(fills.map((f) => f.style)).size).toBe(2)
    for (const { rect } of fills) for (const v of rect) expect(v % CLOUD_CELL).toBe(0)
    const tone = (style: string) =>
      new Set(
        fills
          .filter((f) => f.style === style)
          .flatMap(({ rect: [x, y, w] }) =>
            Array.from({ length: w / CLOUD_CELL }, (_, i) => `${x + i * CLOUD_CELL},${y}`),
          ),
      )
    const [outerStyle, coreStyle] = [...new Set(fills.map((f) => f.style))]
    const outer = tone(outerStyle)
    for (const cell of tone(coreStyle)) expect(outer.has(cell)).toBe(true)
  })

  it('a drifting cloud keeps its shape and moves in whole cells', () => {
    const a = recorder()
    const b = recorder()
    drawCloudShape(a.ctx, 400, 300, 900, 250, 1, '1,2,3', 10)
    drawCloudShape(b.ctx, 400 + 3 * CLOUD_CELL, 300, 900, 250, 1, '1,2,3', 10)
    expect(b.fills.map(({ rect: [x, ...rest] }) => [x - 3 * CLOUD_CELL, ...rest])).toEqual(
      a.fills.map((f) => f.rect),
    )
  })

  it('no clouds in clear weather', () => {
    const { ctx, fills } = recorder()
    drawClouds(ctx, 4000, 2000, { kind: 'clear', intensity: 0 } as never, 0)
    expect(fills).toHaveLength(0)
  })
})
