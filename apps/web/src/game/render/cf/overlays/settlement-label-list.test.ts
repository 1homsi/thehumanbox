import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../../../shared/types'
import {
  collectSettlementLabels,
  fadeSettlementLabels,
  heldSettlementSlots,
  placeLabels,
} from './settlement-label-list'
import { LabelPresence } from '../../label-presence'
import { LABEL_FADE_IN_MS, LABEL_FADE_OUT_MS } from '../../label-presence'
import type { PlacedLabel, SettlementLabel } from '../../settlement-labels'

function world(over: Partial<WorldState> = {}): WorldState {
  return {
    grid: { width: 200, height: 100, origin_x: 0, origin_y: 0 },
    settlements: [
      {
        lineage_id: 'a',
        name: 'Rok',
        tier: 2,
        tier_name: 'village',
        center: [40, 30],
        population: 12,
        building_count: 6,
        capacity: 1,
        score: 1,
      },
      {
        lineage_id: 'b',
        name: 'Mala',
        tier: 5,
        tier_name: 'city',
        center: [60, 30],
        population: 90,
        building_count: 40,
        capacity: 1,
        score: 1,
      },
      {
        lineage_id: 'c',
        name: 'Far',
        tier: 2,
        tier_name: 'village',
        center: [190, 90],
        population: 4,
        building_count: 3,
        capacity: 1,
        score: 1,
      },
      {
        lineage_id: 'd',
        name: 'Bare',
        tier: 0,
        tier_name: 'camp',
        center: [41, 31],
        population: 2,
        building_count: 1,
        capacity: 1,
        score: 1,
      },
    ],
    lineage_names: {},
    ...over,
  } as unknown as WorldState
}

const bounds = { c0: 0, c1: 100, r0: 0, r1: 60 }

describe('settlement labels without the building painter', () => {
  it('letters settlement names in capitals, skipping camps and places out of view', () => {
    const labels = collectSettlementLabels(world(), bounds, 1)
    expect(labels.map((l) => l.title)).toEqual(['ROK', 'MALA'])
    expect(labels[1].major).toBe(true)
    expect(labels[0].sub).toBe('')
  })

  it('fades smaller names in near the overview zoom instead of popping in', () => {
    expect(collectSettlementLabels(world(), bounds, 0.3).map((l) => l.title)).toEqual(['MALA'])
    expect(collectSettlementLabels(world(), bounds, 0.72)[0]?.alpha).toBeCloseTo(0.25)
    expect(collectSettlementLabels(world(), bounds, 1)[0]?.alpha).toBe(1)
  })

  it('always names a tribe on the brink, with what threatens it', () => {
    const w = world({
      tribes_in_peril: [{ lineage_id: 'd', population: 2, cause: 'hunger', since: 1 }],
    } as unknown as Partial<WorldState>)
    const labels = collectSettlementLabels(w, bounds, 0.3)
    const peril = labels.find((l) => l.alert)
    expect(peril).toBeDefined()
    expect(peril!.priority).toBeGreaterThan(1_000_000)
    expect(peril!.sub.startsWith('⚠')).toBe(true)
  })

  it('places nearby labels without overlap, most important first', () => {
    const labels = collectSettlementLabels(world(), bounds, 1)
    const placed = placeLabels(labels, 1, (t) => t.length * 6, 1600, 800)
    expect(placed).toHaveLength(2)
    expect(placed[0].title).toBe('MALA')
    const [a, b] = placed
    const overlap = Math.abs(a.cx - b.cx) * 2 < a.w + b.w && Math.abs(a.cy - b.cy) * 2 < a.h + b.h
    expect(overlap).toBe(false)
  })
})

describe('settlement lettering fades in and out', () => {
  const rok: SettlementLabel = {
    key: 'rok',
    title: 'ROK',
    sub: '',
    x: 300,
    y: 300,
    priority: 30,
    rank: 2,
    alpha: 1,
    major: false,
  }
  const measure = () => 30
  const bounds = { w: 2000, h: 1000 }

  it('fades a settlement in as it is placed, and out where it was when it leaves the view', () => {
    const fade = new LabelPresence<PlacedLabel>()
    const placed = placeLabels([rok], 1, measure, bounds.w, bounds.h)
    const alphas: number[] = []
    for (let t = 0; t <= LABEL_FADE_IN_MS; t += 30) {
      const out = fadeSettlementLabels(fade, 1000 + t, [rok], placed)
      alphas.push(out[0]?.alpha ?? 0)
    }
    expect(alphas[0]).toBe(0)
    expect(alphas[alphas.length - 1]).toBeCloseTo(1)

    const leaving: PlacedLabel[] = []
    for (let t = 30; t <= LABEL_FADE_OUT_MS + 30; t += 30) {
      leaving.push(...fadeSettlementLabels(fade, 1000 + LABEL_FADE_IN_MS + t, [], []))
    }
    expect(leaving.length).toBeGreaterThan(1)
    expect(leaving[0].cx).toBe(placed[0].cx)
    expect(leaving[0].cy).toBe(placed[0].cy)
    expect(leaving[leaving.length - 1].alpha).toBeLessThan(leaving[0].alpha)
  })

  it('a settlement still in view that loses its place fades out where it was, not off at once', () => {
    const fade = new LabelPresence<PlacedLabel>()
    const placed = placeLabels([rok], 1, measure, bounds.w, bounds.h)
    for (let t = 0; t <= LABEL_FADE_IN_MS; t += 30) fadeSettlementLabels(fade, 1000 + t, [rok], placed)

    const lost: PlacedLabel[] = []
    for (let t = 30; t <= LABEL_FADE_OUT_MS; t += 30) {
      lost.push(...fadeSettlementLabels(fade, 1000 + LABEL_FADE_IN_MS + t, [rok], []))
    }
    expect(lost.length).toBeGreaterThan(1)
    expect(lost[0].cx).toBe(placed[0].cx)
    expect(lost[0].cy).toBe(placed[0].cy)
    expect(lost[lost.length - 1].alpha).toBeLessThan(lost[0].alpha)
  })

  it('remembers the place each shown settlement took, for the next placement', () => {
    const fade = new LabelPresence<PlacedLabel>()
    const placed = placeLabels([rok], 1, measure, bounds.w, bounds.h, undefined)
    for (let t = 0; t <= LABEL_FADE_IN_MS; t += 30) fadeSettlementLabels(fade, 1000 + t, [rok], placed)
    const held = heldSettlementSlots(fade, [rok])
    expect(held.get('rok')).toBe(placed[0].slot)
  })
})
