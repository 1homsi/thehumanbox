import { describe, expect, it } from 'vitest'
import { hasBuildingSprite } from '../building-painters/registry'
import { normKind } from './footprints'

describe('normKind', () => {
  it('turns snake case wire names into painter kinds', () => {
    expect(normKind('hut')).toBe('Hut')
    expect(normKind('town_hall')).toBe('TownHall')
    expect(normKind('Shipyard')).toBe('Shipyard')
  })

  it('maps the wire names that are not the snake case of their kind', () => {
    const wire: Record<string, string> = {
      townhouse: 'TownHouse',
      bookstore: 'BookStore',
      mega_hospital: 'Hospital2',
      gravestone: 'GraveStone',
      playground: 'PlayGround',
      flagpole: 'FlagPole',
      billboard: 'BillBoard',
      harbor_light: 'Lighthouse2',
      arcade: 'ArcadeBox',
      grand_fountain: 'Fountain2',
      biolab: 'Greenhouse2',
    }
    for (const [name, kind] of Object.entries(wire)) {
      expect(normKind(name)).toBe(kind)
      expect(hasBuildingSprite(normKind(name))).toBe(true)
    }
  })
})
