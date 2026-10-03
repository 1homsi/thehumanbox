import { describe, expect, it } from 'vitest'
import { labelScale, placeSettlementLabels, type SettlementLabel } from './settlement-labels'

const measure = (text: string, kind: 'major' | 'minor' | 'sub') => text.length * (kind === 'sub' ? 5 : 7)
const bounds = { w: 2000, h: 1000 }

function town(title: string, x: number, y: number, priority: number): SettlementLabel {
  return { title, sub: '10 people · 12 buildings', x, y, priority, major: priority > 50, color: '#fff' }
}

function overlaps(a: { cx: number; cy: number; w: number; h: number }, b: typeof a) {
  return Math.abs(a.cx - b.cx) * 2 < a.w + b.w && Math.abs(a.cy - b.cy) * 2 < a.h + b.h
}

describe('settlement labels', () => {
  it('stay readable on screen when the camera zooms out', () => {
    expect(labelScale(4)).toBe(0.75)
    expect(labelScale(1)).toBe(1)
    expect(labelScale(0.25)).toBe(4)
  })

  it('never overlap, and the most important town keeps its own spot', () => {
    const towns = [
      town('small village', 500, 300, 10),
      town('BIG CITY', 505, 302, 90),
      town('middle town', 498, 305, 40),
      town('other village', 510, 296, 20),
    ]
    const placed = placeSettlementLabels(towns, 1, measure, bounds, 16)
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) expect(overlaps(placed[i]!, placed[j]!)).toBe(false)
    const city = placed.find((p) => p.title === 'BIG CITY')!
    expect(city.cy).toBeLessThan(302)
    expect(city.cx).toBe(505)
    // Four names cannot all fit around one spot; the least important waits.
    expect(placed.length).toBeLessThan(towns.length)
    expect(placed.some((p) => p.title === 'small village')).toBe(false)
  })

  it('places every label when towns are far apart', () => {
    const towns = [town('a', 100, 100, 1), town('b', 600, 400, 2), town('c', 1200, 700, 3)]
    expect(placeSettlementLabels(towns, 1, measure, bounds, 16)).toHaveLength(3)
  })

  it('keeps a label at the map edge fully on the map', () => {
    const [edge] = placeSettlementLabels([town('EDGE CITY', 2, 4, 99)], 2, measure, bounds, 16)
    expect(edge!.cx - edge!.w / 2).toBeGreaterThanOrEqual(0)
    expect(edge!.cy - edge!.h / 2).toBeGreaterThanOrEqual(0)
  })
})
