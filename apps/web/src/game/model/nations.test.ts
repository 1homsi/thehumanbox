import { describe, expect, it } from 'vitest'
import type { NationInfo, WorldState } from '../../shared/types'
import { NATION_PALETTE, nationChunks, nationColour, nationLands, nationRgb, relationTone } from './nations'

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

  it('cuts the land of a nation into chunks with one border round all its members and none between them', () => {
    const world = {
      nations: [nation(1, ['a', 'b'], 3)],
      territory: {
        claimed: [
          { lid: 'a', tiles: [[31, 0]] },
          { lid: 'b', tiles: [[32, 0]] },
        ],
        contested: [],
      },
    } as unknown as Pick<WorldState, 'nations' | 'territory'>
    const chunks = nationChunks(world, 8)
    expect([...chunks.keys()].sort()).toEqual(['0,0', '1,0'])
    const left = chunks.get('0,0')![0]!
    const right = chunks.get('1,0')![0]!
    expect(left.colour).toBe(3)
    expect(left.tint).toEqual([248, 0, 8, 8])
    expect(left.edge.length / 4).toBe(3)
    expect(right.edge.length / 4).toBe(3)
    expect(left.edge.some((_, i) => i % 4 === 0 && left.edge[i] === 254)).toBe(false)
  })

  it('reads a treaty or war first, then warmth or wariness', () => {
    expect(relationTone({ with: 'x', name: 'X', opinion: -0.9, status: 'allied' })).toBe('allied')
    expect(relationTone({ with: 'x', name: 'X', opinion: 0.3, status: '' })).toBe('friendly')
    expect(relationTone({ with: 'x', name: 'X', opinion: -0.3, status: '' })).toBe('wary')
    expect(relationTone({ with: 'x', name: 'X', opinion: 0.05, status: '' })).toBeNull()
  })
})
