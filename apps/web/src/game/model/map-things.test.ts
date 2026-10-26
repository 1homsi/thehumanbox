import { describe, expect, it } from 'vitest'
import type { AnimalState, Building, VehicleInfo, WorldState } from '../../shared/types'
import {
  ANIMAL_REACH,
  CARAVAN_REACH,
  leavesTribeCard,
  mapThingAt,
  thingKey,
  VEHICLE_REACH,
  type ThingWorld,
} from './map-things'

function building(extra: Partial<Building>): Building {
  return { id: 1, kind: 'hut', x: 10, y: 10, ...extra } as Building
}

function world(extra: Partial<Record<keyof ThingWorld, unknown>> = {}): ThingWorld {
  return { buildings: [], vehicles: [], ...extra } as ThingWorld
}

function animal(extra: Partial<AnimalState>): AnimalState {
  return { id: 1, kind: 'rabbit', x: 0, y: 0, ...extra } as AnimalState
}

describe('mapThingAt', () => {
  it('names the building whose footprint covers the tile, and nothing on open ground', () => {
    const w = world({ buildings: [building({ id: 4, x: 10, y: 10, footprint: [2, 3] })] })
    expect(mapThingAt(w, { x: 11.5, y: 12.2 })).toEqual({ kind: 'building', id: 4 })
    expect(mapThingAt(w, { x: 12.5, y: 10.5 })).toBeNull()
    expect(mapThingAt(w, { x: 9.9, y: 10.5 })).toBeNull()
  })

  it('finds a ruin the same way as a standing building', () => {
    const w = world({ buildings: [building({ id: 7, ruined: true, damage: 1, integrity: 0 })] })
    expect(mapThingAt(w, { x: 10.2, y: 10.8 })).toEqual({ kind: 'building', id: 7 })
  })

  it('names a vehicle within reach of its centre, the nearest one when two are', () => {
    const w = world({
      vehicles: [
        { id: 1, kind: 'boat', x: 20, y: 20 },
        { id: 2, kind: 'cart', x: 20, y: 21 },
      ] as VehicleInfo[],
    })
    expect(mapThingAt(w, { x: 20.5, y: 20.5 })).toEqual({ kind: 'vehicle', id: 1 })
    expect(mapThingAt(w, { x: 20.5, y: 21.1 })).toEqual({ kind: 'vehicle', id: 2 })
    expect(mapThingAt(w, { x: 20.5 + VEHICLE_REACH + 0.1, y: 20.5 })).toBeNull()
  })

  it('names an animal within reach of its centre, ahead of a building under it', () => {
    const w = world({
      buildings: [building({ id: 3, x: 5, y: 5 })],
      animals: [animal({ id: 8, x: 5, y: 5 })],
    })
    expect(mapThingAt(w, { x: 5.5, y: 5.5 })).toEqual({ kind: 'animal', id: 8 })
    // A corner of the tile is out of the animal's reach, so the building is what the pointer rests on there.
    expect(mapThingAt(w, { x: 5.05, y: 5.05 })).toEqual({ kind: 'building', id: 3 })
    expect(ANIMAL_REACH).toBeLessThan(Math.hypot(0.5, 0.5))
  })

  it('reads the animals in view when the sim sends them, and skips birds that have flown away', () => {
    const w = world({
      animals: [animal({ id: 1, x: 30, y: 30 })],
      viewport_animals: [animal({ id: 2, x: 4, y: 4 })],
    })
    expect(mapThingAt(w, { x: 4.5, y: 4.5 })).toEqual({ kind: 'animal', id: 2 })
    expect(mapThingAt(w, { x: 30.5, y: 30.5 })).toBeNull()
    const flown = world({ animals: [animal({ id: 3, kind: 'bird', x: 6, y: 6, away: true })] })
    expect(mapThingAt(flown, { x: 6.5, y: 6.5 })).toBeNull()
  })

  it('prefers a building over a vehicle over a caravan on the same spot', () => {
    const w = world({
      buildings: [building({ id: 3, x: 5, y: 5 })],
      vehicles: [{ id: 9, kind: 'boat', x: 5, y: 5 }] as VehicleInfo[],
    })
    const drawn = { caravanAt: () => 12 }
    expect(mapThingAt(w, { x: 5.5, y: 5.5 }, drawn)).toEqual({ kind: 'building', id: 3 })
    const boatOnly = world({ vehicles: [{ id: 9, kind: 'boat', x: 5, y: 5 }] as VehicleInfo[] })
    expect(mapThingAt(boatOnly, { x: 5.5, y: 5.5 }, drawn)).toEqual({ kind: 'vehicle', id: 9 })
  })

  it('asks the renderer for a caravan only when nothing nearer is there', () => {
    const asked: number[] = []
    const drawn = {
      caravanAt: (x: number, _y: number, reach: number) => {
        asked.push(reach)
        return x > 30 ? 5 : null
      },
    }
    expect(mapThingAt(world(), { x: 31, y: 2 }, drawn)).toEqual({ kind: 'caravan', id: 5 })
    expect(mapThingAt(world(), { x: 2, y: 2 }, drawn)).toBeNull()
    expect(asked).toEqual([CARAVAN_REACH, CARAVAN_REACH])
    expect(mapThingAt(world(), { x: 31, y: 2 })).toBeNull()
  })

  it('names a field by its farm id, and a planting by its tile', () => {
    const w = world({
      farms: [{ id: 11, x: 3, y: 4 }] as WorldState['farms'],
      plantings: [6, 7, 4, 4, 9, 9, 1, 0],
    } as Partial<WorldState>)
    expect(mapThingAt(w, { x: 3.5, y: 4.5 })).toEqual({ kind: 'farm', id: 11 })
    expect(mapThingAt(w, { x: 6.2, y: 7.9 })).toEqual({ kind: 'planting', x: 6, y: 7 })
    expect(mapThingAt(w, { x: 9.5, y: 9.5 })).toEqual({ kind: 'planting', x: 9, y: 9 })
    expect(mapThingAt(w, { x: 7.5, y: 7.5 })).toBeNull()
  })

  it('names a tree the renderer drew on the tile under the point, after the buildings and plants', () => {
    const drawn = {
      treeAt: (x: number, y: number) =>
        Math.floor(x) === 12 && Math.floor(y) === 2 ? ('conifer' as const) : null,
    }
    expect(mapThingAt(world(), { x: 12.5, y: 2.5 }, drawn)).toEqual({
      kind: 'tree',
      x: 12,
      y: 2,
      tree: 'conifer',
    })
    expect(mapThingAt(world(), { x: 3.5, y: 2.5 }, drawn)).toBeNull()
    const planted = world({ plantings: [12, 2, 6, 4] } as Partial<WorldState>)
    expect(mapThingAt(planted, { x: 12.5, y: 2.5 }, drawn)).toEqual({ kind: 'planting', x: 12, y: 2 })
  })
})

describe('thingKey', () => {
  it('is the same for the same thing and different for another one', () => {
    expect(thingKey({ kind: 'animal', id: 4 })).toBe(thingKey({ kind: 'animal', id: 4 }))
    expect(thingKey({ kind: 'animal', id: 4 })).not.toBe(thingKey({ kind: 'building', id: 4 }))
    expect(thingKey({ kind: 'planting', x: 1, y: 2 })).toBe(thingKey({ kind: 'planting', x: 1, y: 2 }))
    expect(thingKey({ kind: 'tree', x: 1, y: 2, tree: 'bush' })).not.toBe(
      thingKey({ kind: 'tree', x: 2, y: 1, tree: 'bush' }),
    )
  })
})

describe('leavesTribeCard', () => {
  it('lets trees and plantings leave the tribe card in place, and nothing with a card of its own', () => {
    expect(leavesTribeCard({ kind: 'tree', x: 1, y: 1, tree: 'tree' })).toBe(true)
    expect(leavesTribeCard({ kind: 'planting', x: 1, y: 1 })).toBe(true)
    expect(leavesTribeCard({ kind: 'building', id: 3 })).toBe(false)
    expect(leavesTribeCard({ kind: 'animal', id: 4 })).toBe(false)
  })
})
