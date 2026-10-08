import { describe, expect, it } from 'vitest'
import { SNOW_LIGHT, SNOW_SHADE, snowCapPixels } from './snow'

/** Column x has first opaque row rows[x] (-1 for an empty column). */
const tops = (rows: number[]) => (x: number) => rows[x]

describe('snowCapPixels', () => {
  it('leaves empty columns alone', () => {
    const cells = snowCapPixels(4, tops([-1, 5, -1, 6]), 1)
    expect(cells.some((c) => c.x === 0 || c.x === 2)).toBe(false)
    expect(cells.filter((c) => c.x === 1 && !c.shade)[0]).toEqual({ x: 1, y: 5, shade: false })
    expect(cells.filter((c) => c.x === 3 && !c.shade)[0]).toEqual({ x: 3, y: 6, shade: false })
  })

  it('puts a light cell on the top edge of every filled column', () => {
    const rows = [3, 3, 4, 4, 2, 2]
    const cells = snowCapPixels(rows.length, tops(rows), 42)
    rows.forEach((top, x) => {
      expect(cells.find((c) => c.x === x && !c.shade)?.y).toBe(top)
    })
  })

  it('only adds shade directly under a light cell', () => {
    const cells = snowCapPixels(40, (x) => 10 + (x % 5), 9)
    const lights = new Set(cells.filter((c) => !c.shade).map((c) => `${c.x},${c.y}`))
    for (const c of cells.filter((c) => c.shade)) {
      expect(lights.has(`${c.x},${c.y - 1}`)).toBe(true)
    }
    expect(cells.some((c) => c.shade)).toBe(true)
  })

  it('is deterministic for a seed and differs between seeds', () => {
    const top = (x: number) => 8 + (x % 3)
    expect(snowCapPixels(30, top, 5)).toEqual(snowCapPixels(30, top, 5))
    expect(snowCapPixels(30, top, 5)).not.toEqual(snowCapPixels(30, top, 6))
  })

  it('uses two distinct snow colours', () => {
    expect(SNOW_LIGHT).not.toBe(SNOW_SHADE)
  })
})
