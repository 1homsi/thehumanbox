import { describe, expect, it } from 'vitest'
import type { Building } from '../../types'
import {
  buildingDepthKey,
  compareBuildingsByDepth,
  resolveBuildingFootprint,
  type BuildingLike,
} from './buildings2d'

function building(overrides: Partial<Building> = {}): BuildingLike {
  return {
    id: 1,
    kind: 'House',
    x: 4,
    y: 7,
    condition: 1,
    ...overrides,
  }
}

describe('2D building layout', () => {
  it('prefers the authoritative footprint over wire dimensions and the legacy kind table', () => {
    expect(
      resolveBuildingFootprint(
        building({
          kind: 'University',
          footprint: [3.9, 2.8],
          fw: 6,
          fh: 5,
        }),
      ),
    ).toEqual([3, 2])
  })

  it('uses serialized width and height before the legacy kind table', () => {
    expect(resolveBuildingFootprint(building({ kind: 'Hut', fw: 1, fh: 1 }))).toEqual([1, 1])
    expect(resolveBuildingFootprint(building({ kind: 'University', fw: 4, fh: 4 }))).toEqual([4, 4])
  })

  it('clamps malformed supplied spans to positive integers', () => {
    expect(resolveBuildingFootprint(building({ footprint: [0, -8] }))).toEqual([1, 1])
    expect(resolveBuildingFootprint(building({ fw: 2.9, fh: 0 }))).toEqual([2, 1])
  })

  it('falls back to normalized static kinds for legacy snapshots', () => {
    expect(resolveBuildingFootprint(building({ kind: 'town_house' }))).toEqual([3, 4])
    expect(resolveBuildingFootprint(building({ kind: 'UnknownBuilding' }))).toEqual([1, 1])
  })

  it('depth-sorts by the authoritative bottom edge', () => {
    expect(buildingDepthKey(building({ y: 10, footprint: [2, 3], fw: 8, fh: 8 }))).toBe(13)

    const shallow = building({ id: 8, x: 20, y: 8, fw: 2, fh: 2 })
    const deep = building({ id: 2, x: 1, y: 7, fw: 1, fh: 4 })
    expect([deep, shallow].sort(compareBuildingsByDepth).map(({ id }) => id)).toEqual([8, 2])
  })

  it('uses x and id as deterministic depth ties', () => {
    const buildings = [
      building({ id: 9, x: 4, y: 7, fw: 2, fh: 2 }),
      building({ id: 3, x: 2, y: 7, fw: 2, fh: 2 }),
      building({ id: 1, x: 2, y: 7, fw: 2, fh: 2 }),
    ]

    expect(buildings.sort(compareBuildingsByDepth).map(({ id }) => id)).toEqual([1, 3, 9])
  })
})
