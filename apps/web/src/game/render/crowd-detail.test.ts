import { describe, expect, it } from 'vitest'
import { crowdLabelIds, crowdLabelWinners, LabelPlacer, labelWidth } from './crowd-detail'
it('keeps ordinary crowds unchanged', () => {
  expect(crowdLabelIds([{ id: 'a', x: 1, y: 1 }], 2)).toBeNull()
})
it('bounds dense labels by screen space and keeps selection stable across draw order', () => {
  const people = Array.from({ length: 5000 }, (_, i) => ({ id: `p-${i}`, x: i % 10, y: i % 3 }))
  const labels = crowdLabelIds(people, 2)!
  expect(labels.size).toBeLessThanOrEqual(6)
  expect(labels).toEqual(crowdLabelIds([...people].reverse(), 2))
  expect(people).toHaveLength(5000)
  expect(crowdLabelIds(people, 8)!.size).toBeGreaterThan(labels.size)
})

describe('crowd label winners', () => {
  it('marks exactly the people whose ids the Set version keeps, for any slot order and zoom', () => {
    let seed = 99
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (const [zoom, spread] of [
      [0.5, 300],
      [2, 300],
      [8, 300],
      [2, 1e7],
    ] as const) {
      for (const n of [10, 401, 3000]) {
        const people = Array.from({ length: n }, (_, i) => ({
          id: `p${Math.floor(rand() * 1e6)}-${i}`,
          x: rand() * spread,
          y: rand() * spread,
        }))
        const slots = Int32Array.from({ length: n }, (_, i) => n - 1 - i) // visit in reverse slot order
        const out = new Uint8Array(n).fill(7)
        const thinned = crowdLabelWinners(people, slots, n, zoom, out)
        const labels = crowdLabelIds(people, zoom)
        expect(thinned).toBe(labels !== null)
        if (labels === null) continue
        people.forEach((p, j) => expect(out[j]).toBe(labels.has(p.id) ? 1 : 0))
      }
    }
  })
})

describe('label placer keys', () => {
  it('places the same boxes as a float-keyed reference, near the origin and far beyond the Smi range', () => {
    // The reference: the same overlap test with every bucket keyed by its float key.
    class Reference {
      private cells = new Map<number, number[]>()
      place(x: number, y: number, w: number, h: number, force = false): boolean {
        const x0 = x - w / 2
        const y0 = y - h
        const x1 = x + w / 2
        const y1 = y
        const cx0 = Math.floor(x0 / 48)
        const cx1 = Math.floor(x1 / 48)
        const cy0 = Math.floor(y0 / 48)
        const cy1 = Math.floor(y1 / 48)
        const key = (cx: number, cy: number) => (cx + 0x100000) * 0x400000 + (cy + 0x100000)
        if (!force) {
          for (let cx = cx0; cx <= cx1; cx++)
            for (let cy = cy0; cy <= cy1; cy++) {
              const list = this.cells.get(key(cx, cy))
              if (!list) continue
              for (let i = 0; i < list.length; i += 4)
                if (x0 < list[i + 2] && x1 > list[i] && y0 < list[i + 3] && y1 > list[i + 1]) return false
            }
        }
        for (let cx = cx0; cx <= cx1; cx++)
          for (let cy = cy0; cy <= cy1; cy++) {
            const list = this.cells.get(key(cx, cy))
            if (list) list.push(x0, y0, x1, y1)
            else this.cells.set(key(cx, cy), [x0, y0, x1, y1])
          }
        return true
      }
    }
    let seed = 7
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (const [spread, offset] of [
      [2000, 0],
      [2000, -1e6],
      [2000, 5e7],
    ] as const) {
      const fast = new LabelPlacer()
      const ref = new Reference()
      for (let k = 0; k < 800; k++) {
        const x = offset + rand() * spread
        const y = offset + rand() * spread
        const force = rand() < 0.05
        expect(fast.place(x, y, 40, 10, force)).toBe(ref.place(x, y, 40, 10, force))
      }
    }
  })
})

describe('label placer', () => {
  it('skips labels that would overlap and always keeps forced ones', () => {
    const placer = new LabelPlacer()
    expect(placer.place(100, 100, 40, 10)).toBe(true)
    expect(placer.place(110, 104, 40, 10)).toBe(false)
    expect(placer.place(100, 120, 40, 10)).toBe(true)
    expect(placer.place(150, 100, 40, 10)).toBe(true)
    expect(placer.place(105, 100, 40, 10, true)).toBe(true)
  })

  it('estimates monospace label widths', () => {
    expect(labelWidth('Ashari', 10)).toBeCloseTo(40)
  })
})
