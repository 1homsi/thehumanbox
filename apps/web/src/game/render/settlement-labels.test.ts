import { describe, expect, it } from 'vitest'
import {
  PARCHMENT_HALO,
  drawSettlementLabels,
  labelScale,
  labelKind,
  placeSettlementLabels,
  titleFont,
  titleSpacing,
  type LabelKind,
  type SettlementLabel,
} from './settlement-labels'

const measure = (text: string, kind: LabelKind) => text.length * (kind === 'hamlet' ? 5 : 7)
const bounds = { w: 2000, h: 1000 }

function town(title: string, x: number, y: number, priority: number): SettlementLabel {
  const rank = priority > 50 ? 5 : priority > 25 ? 3 : 1
  return { title, sub: '', x, y, priority, rank, alpha: 1, major: rank >= 5 }
}

function overlaps(a: { cx: number; cy: number; w: number; h: number }, b: typeof a) {
  return Math.abs(a.cx - b.cx) * 2 < a.w + b.w && Math.abs(a.cy - b.cy) * 2 < a.h + b.h
}

describe('settlement labels', () => {
  it('stay readable on screen when the camera zooms out', () => {
    expect(labelScale(4)).toBe(0.75)
    expect(labelScale(1)).toBe(1)
    // Zoomed all the way out the lettering is 60% of its usual screen size, so names do not cover the map.
    expect(labelScale(0.25)).toBeCloseTo(4 * 0.6)
  })

  it('sets lettering size and spacing by settlement rank', () => {
    expect([1, 2, 3, 4, 5].map(labelKind)).toEqual(['hamlet', 'hamlet', 'town', 'town', 'city'])
    expect(titleFont('hamlet', 1)).toBe('bold 11.00px monospace')
    expect(titleFont('town', 1)).toBe('bold 14.00px monospace')
    expect(titleFont('city', 2)).toBe('bold 34.00px monospace')
    expect(titleSpacing('city', 1)).toBe('3.00px')
  })

  it('reserves room for the letter spacing it draws with', () => {
    // A town (rank 4) is measured and drawn in the same font: 7 px a letter here, plus 2 px between letters.
    const [placed] = placeSettlementLabels(
      [{ ...town('ABCD', 400, 300, 40), rank: 4 }],
      1,
      measure,
      bounds,
      16,
    )
    expect(placed!.w).toBe(4 * 7 + 3 * 2)
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

  it('keeps two tribes in peril from printing their warnings over each other', () => {
    const peril = (title: string, y: number): SettlementLabel => ({
      ...town(title, 500, y, 30),
      alert: true,
      sub: '⚠ only 5 left · no one is left to raise children',
    })
    const placed = placeSettlementLabels(
      [peril('HUFEGJA', 300), peril('SAWKIL', 318)],
      1,
      measure,
      bounds,
      16,
    )
    expect(placed).toHaveLength(2)
    expect(overlaps(placed[0]!, placed[1]!)).toBe(false)
    expect(placed[0]!.h).toBeGreaterThan(placed[0]!.titleH)
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

  it('sizes map lettering without reserving space for always-on counts', () => {
    const placed = placeSettlementLabels([town('OLD TOWN', 400, 300, 40)], 1, measure, bounds, 16)
    expect(placed[0]?.sub).toBe('')
    expect(placed[0]?.h).toBe(18)
  })

  it('draws map lettering with ink text and a parchment halo', () => {
    const calls: { op: string; args: unknown[] }[] = []
    const ctx = {
      save: () => calls.push({ op: 'save', args: [] }),
      restore: () => calls.push({ op: 'restore', args: [] }),
      strokeText: (text: string, x: number, y: number) =>
        calls.push({ op: 'strokeText', args: [text, x, y, ctx.strokeStyle, ctx.lineWidth] }),
      fillText: (text: string, x: number, y: number) =>
        calls.push({ op: 'fillText', args: [text, x, y, ctx.fillStyle] }),
      textAlign: '',
      textBaseline: '',
      font: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      lineJoin: '',
      globalAlpha: 1,
      letterSpacing: '0px',
    } as unknown as CanvasRenderingContext2D

    const placed = placeSettlementLabels([town('JELZOBAF', 400, 300, 90)], 1, measure, bounds, 16)
    drawSettlementLabels(ctx, placed)

    expect(
      calls.some((c) => c.op === 'strokeText' && c.args[0] === 'JELZOBAF' && c.args[3] === PARCHMENT_HALO),
    ).toBe(true)
    expect(
      calls.some((c) => c.op === 'fillText' && c.args[0] === 'JELZOBAF' && c.args[3] === '#2b2117'),
    ).toBe(true)
  })
})
