import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../../../shared/types'
import { collectSettlementLabels, placeLabels } from './settlement-label-list'

function world(over: Partial<WorldState> = {}): WorldState {
  return {
    grid: { width: 200, height: 100, origin_x: 0, origin_y: 0 },
    settlements: [
      { lineage_id: 'a', name: 'Rok', tier: 2, tier_name: 'village', center: [40, 30], population: 12, building_count: 6, capacity: 1, score: 1 },
      { lineage_id: 'b', name: 'Mala', tier: 5, tier_name: 'city', center: [60, 30], population: 90, building_count: 40, capacity: 1, score: 1 },
      { lineage_id: 'c', name: 'Far', tier: 2, tier_name: 'village', center: [190, 90], population: 4, building_count: 3, capacity: 1, score: 1 },
      { lineage_id: 'd', name: 'Bare', tier: 0, tier_name: 'camp', center: [41, 31], population: 2, building_count: 1, capacity: 1, score: 1 },
    ],
    lineage_names: {},
    ...over,
  } as unknown as WorldState
}

const bounds = { c0: 0, c1: 100, r0: 0, r1: 60 }

describe('settlement labels without the building painter', () => {
  it('names towns and cities, skipping camps and places out of view', () => {
    const labels = collectSettlementLabels(world(), bounds, 1)
    expect(labels.map((l) => l.title)).toEqual(['Rok village', 'MALA CITY'])
    expect(labels[1].major).toBe(true)
    expect(labels[0].sub).toBe('12 people · 6 buildings')
  })

  it('keeps only cities when zoomed far out', () => {
    expect(collectSettlementLabels(world(), bounds, 0.3).map((l) => l.title)).toEqual(['MALA CITY'])
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
    expect(placed[0].title).toBe('MALA CITY')
    const [a, b] = placed
    const overlap = Math.abs(a.cx - b.cx) * 2 < a.w + b.w && Math.abs(a.cy - b.cy) * 2 < a.h + b.h
    expect(overlap).toBe(false)
  })
})
