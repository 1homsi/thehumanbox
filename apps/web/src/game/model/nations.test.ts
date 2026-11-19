import { describe, expect, it } from 'vitest'
import type { NationInfo, WorldState } from '../../shared/types'
import {
  NATION_PALETTE,
  TOWN_LAND_REACH,
  nationColour,
  nationLands,
  nationRgb,
  relationTone,
} from './nations'

function nation(id: number, members: string[], colour = 0): NationInfo {
  return {
    id,
    name: `N${id}`,
    colour,
    capital: 1,
    capital_at: [0, 0],
    ruler: members[0]!,
    members,
    towns: [],
    founded_tick: 0,
    cohesion: 1,
    relations: [],
  }
}

describe('nations', () => {
  it('maps a colour index onto the palette, wrapping past its end', () => {
    expect(nationRgb(0)).toEqual(NATION_PALETTE[0])
    expect(nationRgb(NATION_PALETTE.length + 2)).toEqual(NATION_PALETTE[2])
    expect(nationColour(1)).toMatch(/^rgb\(/)
    expect(nationColour(1, 0.5)).toMatch(/^rgba\(.*,0\.5\)$/)
  })

  it('joins the land of every member tribe into one country and leaves the others out', () => {
    const world = {
      nations: [nation(1, ['a', 'b'])],
      territory: {
        claimed: [
          {
            lid: 'a',
            tiles: [
              [1, 1],
              [2, 1],
            ],
          },
          {
            lid: 'b',
            tiles: [
              [2, 1],
              [3, 1],
            ],
          },
          { lid: 'c', tiles: [[9, 9]] },
        ],
        contested: [],
      },
    } as unknown as Pick<WorldState, 'nations' | 'territory'>
    const lands = nationLands(world)
    expect([...lands.keys()]).toEqual([1])
    expect(lands.get(1)!.tiles).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
    ])
  })

  it('counts the ground round each member town as part of the nation, but not the water', () => {
    const tiles = Array.from({ length: 40 }, () => Array.from({ length: 40 }, (_, x) => (x >= 25 ? 2 : 0)))
    const world = {
      nations: [nation(2, ['a'])],
      towns: [{ id: 1, lineage_id: 'a', center: [20, 20], planned: true }],
      grid: { origin_x: 0, origin_y: 0, tiles },
    } as unknown as Parameters<typeof nationLands>[0]
    const land = nationLands(world).get(2)!
    expect(land.keys.has('20,20')).toBe(true)
    expect(land.keys.has(`${20 - TOWN_LAND_REACH},${20 + TOWN_LAND_REACH}`)).toBe(true)
    expect(land.keys.has('26,20')).toBe(false)
    expect(land.keys.has(`20,${21 + TOWN_LAND_REACH}`)).toBe(false)
  })

  it('reads a treaty or war first, then warmth or wariness', () => {
    expect(relationTone({ with: 'x', name: 'X', opinion: -0.9, status: 'allied' })).toBe('allied')
    expect(relationTone({ with: 'x', name: 'X', opinion: 0.3, status: '' })).toBe('friendly')
    expect(relationTone({ with: 'x', name: 'X', opinion: -0.3, status: '' })).toBe('wary')
    expect(relationTone({ with: 'x', name: 'X', opinion: 0.05, status: '' })).toBeNull()
  })
})
