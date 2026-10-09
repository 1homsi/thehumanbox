import { describe, expect, it } from 'vitest'
import type { Building } from '../../../../shared/types'
import { sortBuildingsByDepth } from '../../buildings2d'
import { tribeTintIndex } from '../../building-painters/tribe-palette'
import {
  buildingSortKey,
  contentOrigin,
  contentSize,
  describeBuilding,
  nightBucketOf,
  type BuildingFrameInfo,
} from './building-visuals'

const info = (over: Partial<BuildingFrameInfo> = {}): BuildingFrameInfo => ({
  tick: 1000,
  nightBucket: 0,
  detail: 'standard',
  tiers: new Map(),
  winter: false,
  ...over,
})

const house = (over: Partial<Building> = {}): Building => ({
  id: 1,
  kind: 'house',
  x: 10,
  y: 20,
  condition: 1,
  damage: 0,
  integrity: 1,
  ...over,
})

describe('describeBuilding', () => {
  it('shares one cell between finished, undamaged buildings with the same look', () => {
    // Variant is hashed from id and position: find two buildings that land on the same one.
    const keys = new Map<string, number>()
    for (let id = 1; id < 200; id++) {
      const key = describeBuilding(house({ id, x: id, y: 3 }), info()).key
      keys.set(key, (keys.get(key) ?? 0) + 1)
    }
    // At most 8 variants x the other axes: far fewer cells than buildings.
    expect(keys.size).toBeLessThanOrEqual(8)
    expect([...keys.values()].some((n) => n > 1)).toBe(true)
  })

  it('splits by night bucket, tier and condition', () => {
    const base = describeBuilding(house(), info()).key
    expect(describeBuilding(house(), info({ nightBucket: 2 })).key).not.toBe(base)
    expect(
      describeBuilding(house({ owner_lineage: 'a' }), info({ tiers: new Map([['a', 3]]) })).key,
    ).not.toBe(base)
    expect(describeBuilding(house({ integrity: 0.3, damage: 0.7 }), info()).key).not.toBe(base)
  })

  it('gives a stone-age hut the style of its land, and leaves later homes alone', () => {
    const tundra = info({ landAt: () => 'snow' })
    const hut = house({ kind: 'Hut' })
    expect(describeBuilding(hut, tundra).record.land).toBe('snow')
    expect(describeBuilding(hut, tundra).key).not.toBe(describeBuilding(hut, info()).key)
    // Past the stone age the tribe's era style wins, so the land stays out of the look.
    const bronze = info({ landAt: () => 'snow', tiers: new Map([['', 1]]) })
    expect(describeBuilding(house({ kind: 'House' }), bronze).record.land).toBe('')
  })

  it('gives each tribe its own roof colour on its homes, and leaves other buildings alone', () => {
    const first = 'a78d6ac1'
    const other = ['fb8ca075', 'b0bcf3c0', '38023c20', 'f1605508', '2853f5c8'].find(
      (id) => tribeTintIndex(id) !== tribeTintIndex(first),
    )
    if (other === undefined) throw new Error('need a tribe with another roof colour')
    const tribeA = describeBuilding(house({ kind: 'House', owner_lineage: first }), info())
    const tribeB = describeBuilding(house({ kind: 'House', owner_lineage: other }), info())
    expect(tribeA.record.roofTint).toBeDefined()
    expect(tribeA.record.roofTint).not.toBe(tribeB.record.roofTint)
    expect(tribeA.key).not.toBe(tribeB.key)
    // The same tribe's house, a different one of the same kind, shares its tint.
    const sameTribe = describeBuilding(house({ id: 9, kind: 'House', owner_lineage: 'a78d6ac1' }), info())
    expect(sameTribe.record.roofTint).toBe(tribeA.record.roofTint)
    const shrine = describeBuilding(house({ kind: 'Shrine', owner_lineage: 'a78d6ac1' }), info())
    expect(shrine.record.roofTint).toBeUndefined()
  })

  it('keys construction sites by position and quantised progress', () => {
    const a = describeBuilding(house({ condition: 0.5 }), info())
    const b = describeBuilding(house({ condition: 0.5001 }), info())
    const c = describeBuilding(house({ condition: 0.8 }), info())
    expect(a.key.startsWith('C|')).toBe(true)
    expect(b.key).toBe(a.key)
    expect(c.key).not.toBe(a.key)
    // The record that gets painted carries the bucket centre, not the raw value.
    expect(a.record.condition).toBe(24 / 48)
    // Sites are hashed from their own id and position, so they do not share a cell.
    expect(describeBuilding(house({ id: 2, condition: 0.5 }), info()).key).not.toBe(a.key)
  })

  it('keys ruins by age bucket and carries the ruin age', () => {
    const ruin = house({ ruined: true, ruined_at_tick: 0, damage: 1, integrity: 0 })
    const young = describeBuilding(ruin, info({ tick: 100 }))
    const old = describeBuilding(ruin, info({ tick: 11_000 }))
    expect(young.key.startsWith('R|')).toBe(true)
    expect(old.key).not.toBe(young.key)
    expect(old.record.ruinAge).toBeGreaterThan(young.record.ruinAge ?? 0)
  })

  it('ignores night and variant for kinds that fall back to an emoji', () => {
    const a = describeBuilding(house({ kind: 'definitely_not_a_kind', id: 1 }), info({ nightBucket: 0 }))
    const b = describeBuilding(
      house({ kind: 'definitely_not_a_kind', id: 2, x: 99 }),
      info({ nightBucket: 3 }),
    )
    expect(a.key.startsWith('E|')).toBe(true)
    expect(b.key).toBe(a.key)
  })

  it('sizes cells from the footprint', () => {
    expect(contentSize(1, 1)).toEqual({ w: 24, h: 38 })
    expect(contentSize(3, 2)).toEqual({ w: 40, h: 46 })
    const v = describeBuilding(house({ footprint: [3, 2] }), info())
    expect([v.fw, v.fh]).toEqual([3, 2])
    expect([v.contentW, v.contentH]).toEqual([40, 46])
  })

  it('places the content rectangle at the padded tile origin', () => {
    expect(contentOrigin({ x: 12, y: 7 }, 10, 5)).toEqual({ x: 16 - 8, y: 16 - 26 })
  })
})

describe('buildingSortKey', () => {
  it('orders like the canvas painter: bottom edge, then left edge', () => {
    const list = [
      house({ id: 1, x: 5, y: 10 }),
      house({ id: 2, x: 2, y: 10 }),
      house({ id: 3, x: 9, y: 4, footprint: [2, 8] }),
      house({ id: 4, x: 1, y: 11 }),
      house({ id: 5, x: 300, y: 40, footprint: [4, 3] }),
    ]
    const byKey = [...list].sort((a, b) => buildingSortKey(a) - buildingSortKey(b)).map((b) => b.id)
    expect(byKey).toEqual(sortBuildingsByDepth(list).map((b) => b.id))
    // Float32 keeps the distinction between neighbouring columns.
    const f = new Float32Array([buildingSortKey(list[0]), buildingSortKey(list[1])])
    expect(f[1]).toBeLessThan(f[0])
  })
})

describe('nightBucketOf', () => {
  it('is 0 by day and a bucket of 0..3 at night, as the canvas painter computes it', () => {
    expect(nightBucketOf({ is_day: true, day_progress: 0.3 })).toBe(0)
    expect(nightBucketOf({ is_day: false, day_progress: 0.85 })).toBe(1)
    expect(nightBucketOf({ is_day: false, day_progress: 0.55 })).toBe(3)
    expect(nightBucketOf({ is_day: false, day_progress: 1 })).toBe(0)
  })
})

describe('winter roofs', () => {
  it('gives a house its own winter cell, and leaves the summer cell as it was', () => {
    const hut = house({ id: 7, kind: 'Hut' })
    const summer = describeBuilding(hut, info())
    const winter = describeBuilding(hut, info({ winter: true }))
    expect(winter.key).not.toBe(summer.key)
    expect(winter.record.snow).toBe(true)
    expect(summer.record.snow).toBe(false)
  })

  it('does not split the cell of a building that has no roof snow', () => {
    const fountain = house({ id: 7, kind: 'Fountain' })
    expect(describeBuilding(fountain, info({ winter: true })).key).toBe(
      describeBuilding(fountain, info()).key,
    )
  })
})
