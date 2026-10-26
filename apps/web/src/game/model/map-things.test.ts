import { describe, expect, it } from 'vitest'
import type { Building, VehicleInfo, WorldState } from '../../shared/types'
import { CARAVAN_REACH, mapThingAt, VEHICLE_REACH } from './map-things'

function building(extra: Partial<Building>): Building {
  return { id: 1, kind: 'hut', x: 10, y: 10, ...extra } as Building
}

function world(extra: { buildings?: Building[]; vehicles?: VehicleInfo[] } = {}) {
  return { buildings: [], vehicles: [], ...extra } as Pick<WorldState, 'buildings' | 'vehicles'>
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
      ],
    })
    expect(mapThingAt(w, { x: 20.5, y: 20.5 })).toEqual({ kind: 'vehicle', id: 1 })
    expect(mapThingAt(w, { x: 20.5, y: 21.1 })).toEqual({ kind: 'vehicle', id: 2 })
    expect(mapThingAt(w, { x: 20.5 + VEHICLE_REACH + 0.1, y: 20.5 })).toBeNull()
  })

  it('prefers a building over a vehicle over a caravan on the same spot', () => {
    const w = world({
      buildings: [building({ id: 3, x: 5, y: 5 })],
      vehicles: [{ id: 9, kind: 'boat', x: 5, y: 5 }],
    })
    const caravanAt = () => 12
    expect(mapThingAt(w, { x: 5.5, y: 5.5 }, caravanAt)).toEqual({ kind: 'building', id: 3 })
    expect(
      mapThingAt(world({ vehicles: [{ id: 9, kind: 'boat', x: 5, y: 5 }] }), { x: 5.5, y: 5.5 }, caravanAt),
    ).toEqual({
      kind: 'vehicle',
      id: 9,
    })
  })

  it('asks the renderer for a caravan only when nothing nearer is there', () => {
    const asked: number[] = []
    const caravanAt = (x: number, _y: number, reach: number) => {
      asked.push(reach)
      return x > 30 ? 5 : null
    }
    expect(mapThingAt(world(), { x: 31, y: 2 }, caravanAt)).toEqual({ kind: 'caravan', id: 5 })
    expect(mapThingAt(world(), { x: 2, y: 2 }, caravanAt)).toBeNull()
    expect(asked).toEqual([CARAVAN_REACH, CARAVAN_REACH])
    expect(mapThingAt(world(), { x: 31, y: 2 })).toBeNull()
  })
})
