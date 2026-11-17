import { describe, expect, it } from 'vitest'
import { C, INK } from './palette.ts'
import { PEAK_H, PEAK_W, mountainPeaks, peakArt } from './peaks.ts'

/** Heights of a square range `size` tiles across in a map `map` tiles wide: tiles deep inside the range. */
function range(size: number, map: number): Uint8Array {
  const start = Math.floor((map - size) / 2)
  const h = new Uint8Array(map * map)
  for (let y = start; y < start + size; y++)
    for (let x = start; x < start + size; x++)
      h[y * map + x] = Math.min(x - start, y - start, start + size - 1 - x, start + size - 1 - y) + 1
  return h
}

describe('mountain peaks', () => {
  it('fit their cell in every size, stone and variant', () => {
    for (const size of [0, 1, 2] as const)
      for (const snow of [false, true])
        for (const volcanic of [false, true])
          for (const variant of [0, 1] as const) {
            const a = peakArt(size, snow, volcanic, variant)
            expect(a.w).toBeLessThanOrEqual(PEAK_W)
            expect(a.h).toBeLessThanOrEqual(PEAK_H)
          }
  })

  it('are lit on the north-west face and shaded on the south-east, inside an ink outline', () => {
    const a = peakArt(2, false, false, 0)
    const row = a.h - 4
    const cells = Array.from({ length: a.w }, (_, x) => a.get(x, row)).filter((c) => c !== 0)
    expect(cells[0]).toBe(INK)
    expect(cells[cells.length - 1]).toBe(INK)
    expect(cells.indexOf(C.grey8)).toBeLessThan(cells.indexOf(C.grey5))
    expect(cells.indexOf(C.grey8)).toBeGreaterThan(-1)
  })

  it('carry snow only at the summit, and only when asked', () => {
    const bare = peakArt(2, false, false, 0)
    const capped = peakArt(2, true, false, 0)
    expect(bare.px.includes(C.grey9)).toBe(false)
    expect(capped.px.includes(C.grey9)).toBe(true)
    // The foot of a snow peak is still rock.
    const foot = Array.from({ length: capped.w }, (_, x) => capped.get(x, capped.h - 2))
    expect(foot.includes(C.grey9)).toBe(false)
  })

  it('lean two ways, so a range is not one peak repeated', () => {
    expect(peakArt(1, false, false, 0).px.join()).not.toBe(peakArt(1, false, false, 1).px.join())
  })

  it('stand inside a range, north to south, bigger and snowier toward its heart', () => {
    const map = 40
    const peaks = mountainPeaks(range(24, map), map, map)
    expect(peaks.length).toBeGreaterThan(20)
    // Never on the outermost ring, and never off the range.
    const h = range(24, map)
    for (const p of peaks) expect(h[p.y * map + p.x]).toBeGreaterThanOrEqual(2)
    // North to south, so a nearer peak is drawn over a farther one.
    for (let i = 1; i < peaks.length; i++) expect(peaks[i].y).toBeGreaterThanOrEqual(peaks[i - 1].y)
    expect(peaks.some((p) => p.size === 0)).toBe(true)
    expect(peaks.some((p) => p.size === 2 && p.snow)).toBe(true)
    for (const p of peaks) if (p.snow) expect(h[p.y * map + p.x]).toBeGreaterThanOrEqual(6)
  })

  it('leave a narrow ridge without snow and the open ground without peaks', () => {
    expect(mountainPeaks(new Uint8Array(100), 10, 10)).toEqual([])
    const peaks = mountainPeaks(range(6, 16), 16, 16)
    expect(peaks.every((p) => !p.snow)).toBe(true)
  })

  it('place the same peaks every time', () => {
    const h = range(20, 30)
    expect(mountainPeaks(h, 30, 30)).toEqual(mountainPeaks(h, 30, 30))
  })
})
