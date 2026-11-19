import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../../../shared/types'
import { lineageColor } from '../../../../shared/constants'
import { nationColour } from '../../../model/nations'
import {
  cultureRoof,
  roofTintFor,
  TRIBE_ROOF_TINTS,
  tribeTintIndex,
} from '../../building-painters/tribe-palette'
import { townBanners } from './paint-banners'

const world = {
  towns: [
    { id: 1, lineage_id: 'a', center: [10, 10], planned: true },
    { id: 2, lineage_id: 'b', center: [20, 10], planned: true },
    { id: 3, lineage_id: 'c', center: [30, 10], planned: true },
    { id: 4, lineage_id: 'c', center: [40, 10], planned: false },
    { id: 5, lineage_id: 'c', center: [400, 400], planned: true },
  ],
  nations: [{ id: 9, colour: 4, capital: 1, members: ['a', 'b'] }],
} as unknown as Pick<WorldState, 'towns' | 'nations'>

const bounds = { c0: 0, c1: 60, r0: 0, r1: 40 }

describe('town banners', () => {
  it('fly the nation colour over its towns, crown the capital, and a free tribe its own colour', () => {
    const banners = townBanners(world, 0, 0, bounds)
    expect(banners.map((b) => [b.x, b.colour, b.capital])).toEqual([
      [12, nationColour(4), true],
      [22, nationColour(4), false],
      [32, lineageColor('c'), false],
    ])
  })
})

describe('culture roofs', () => {
  it('give the homes of one nation one roof, and a free tribe its own', () => {
    expect(roofTintFor('House', 'a', 4)).toBe(cultureRoof(4))
    expect(roofTintFor('Hut', 'b', 4)).toBe(roofTintFor('Hut', 'a', 4))
    expect(roofTintFor('House', 'c')).toBe(TRIBE_ROOF_TINTS[tribeTintIndex('c')])
    expect(roofTintFor('Granary', 'a', 4)).toBe(roofTintFor('Granary', 'c'))
    expect(new Set([0, 1, 2, 3, 4, 5].map(cultureRoof)).size).toBe(6)
  })
})
