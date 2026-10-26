import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../shared/types'
import { DEEP_WATER_WIRE, groundIsNotable, terrainAt } from './map-terrain'
import { TILE_ID } from './terrain-ids'

/** A 3x3 grid whose only non-default cell is (1, 1), with the given layers set on that cell. */
function grid(
  cell: { tile?: number; depth?: number; fertility?: number; fire?: number; road?: number },
  origin = 0,
) {
  const at = (value: number) => [
    [0, 0, 0],
    [0, value, 0],
    [0, 0, 0],
  ]
  const tile = cell.tile ?? TILE_ID.GRASS
  const tiles = [
    [TILE_ID.GRASS, TILE_ID.GRASS, TILE_ID.GRASS],
    [TILE_ID.GRASS, tile, TILE_ID.GRASS],
    [TILE_ID.GRASS, TILE_ID.GRASS, TILE_ID.GRASS],
  ]
  const depth = [
    [255, 255, 255],
    [255, cell.depth ?? 255, 255],
    [255, 255, 255],
  ]
  const fertility = [
    [0.5, 0.5, 0.5],
    [0.5, cell.fertility ?? 0.5, 0.5],
    [0.5, 0.5, 0.5],
  ]
  return {
    width: 3,
    height: 3,
    origin_x: origin,
    origin_y: origin,
    tiles,
    depth_map: depth,
    fertility,
    fire_intensity: at(cell.fire ?? 0),
    roads: at(cell.road ?? 0),
    structure: at(0),
  } as unknown as WorldState['grid']
}

/** The facts for the middle tile of a grid made from the given cell. */
const facts = (cell: Parameters<typeof grid>[0], origin = 0) =>
  terrainAt({ grid: grid(cell, origin) }, 1 + origin + 0.5, 1 + origin + 0.5)

describe('terrainAt', () => {
  it('names plain grass with nothing to note', () => {
    expect(facts({})).toEqual({ ground: 'grass', notes: [] })
  })

  it('tells deep water from shallow water by its depth, the same bar the simulation uses', () => {
    expect(facts({ tile: TILE_ID.WATER, depth: DEEP_WATER_WIRE - 1 })?.ground).toBe('deepWater')
    expect(facts({ tile: TILE_ID.WATER, depth: DEEP_WATER_WIRE })?.ground).toBe('shallowWater')
    expect(facts({ tile: TILE_ID.WATER, depth: 184 })?.ground).toBe('shallowWater')
    const noDepth = { grid: { ...grid({ tile: TILE_ID.WATER }), depth_map: undefined } as WorldState['grid'] }
    expect(terrainAt(noDepth, 1.5, 1.5)?.ground).toBe('shallowWater')
  })

  it('names each kind of ground the tiles can be', () => {
    const named: [number, string][] = [
      [TILE_ID.FLOODED, 'floodwater'],
      [TILE_ID.SNOW, 'snow'],
      [TILE_ID.ICE, 'ice'],
      [TILE_ID.SAND, 'sand'],
      [TILE_ID.LAVA, 'lava'],
      [TILE_ID.ROCK, 'rock'],
      [TILE_ID.ASH, 'ash'],
      [TILE_ID.SCORCHED, 'scorched'],
      [TILE_ID.MINERAL, 'mineral'],
      [TILE_ID.FOOD, 'foodGround'],
      [TILE_ID.FIRE, 'fire'],
      [TILE_ID.CAMPFIRE, 'campfire'],
    ]
    for (const [tile, ground] of named) expect(facts({ tile })?.ground).toBe(ground)
  })

  it('is null off the grid, on the empty sea past the map, and on a hut (a building has its own card)', () => {
    expect(terrainAt({ grid: grid({}) }, 5.5, 5.5)).toBeNull()
    expect(facts({ tile: TILE_ID.VOID })).toBeNull()
    expect(facts({ tile: TILE_ID.HUT })).toBeNull()
  })

  it('notes the road on the tile: a track, a railway, a canal or a bridge', () => {
    expect(facts({ road: 1 })?.notes).toEqual(['track'])
    expect(facts({ road: 3 })?.notes).toEqual(['rail'])
    expect(facts({ road: 4 })?.notes).toEqual(['canal'])
    expect(facts({ tile: TILE_ID.WATER, depth: 200, road: 2 })).toEqual({
      ground: 'shallowWater',
      notes: ['bridge'],
    })
  })

  it('notes fertile soil only on land that grows things', () => {
    expect(facts({ fertility: 0.7 })?.notes).toEqual(['fertile'])
    expect(facts({ fertility: 0.3 })?.notes).toEqual([])
    expect(facts({ tile: TILE_ID.SAND, fertility: 0.9 })?.notes).toEqual([])
    expect(facts({ tile: TILE_ID.WATER, depth: 200, fertility: 0.9 })?.notes).toEqual([])
  })

  it('notes fire burning on any ground, but not twice on the fire itself', () => {
    expect(facts({ fire: 0.4 })).toEqual({ ground: 'grass', notes: ['onFire'] })
    expect(facts({ tile: TILE_ID.FIRE, fire: 0.4 })).toEqual({ ground: 'fire', notes: [] })
  })

  it('reads a grid whose origin is not zero from the world tile', () => {
    expect(facts({ tile: TILE_ID.SNOW }, 100)?.ground).toBe('snow')
    expect(terrainAt({ grid: grid({ tile: TILE_ID.SNOW }, 100) }, 1.5, 1.5)).toBeNull()
  })
})

describe('groundIsNotable', () => {
  it('leaves plain grass, fertile or not, without a card of its own', () => {
    expect(groundIsNotable({ ground: 'grass', notes: [] })).toBe(false)
    expect(groundIsNotable({ ground: 'grass', notes: ['fertile'] })).toBe(false)
  })

  it('names water, snow and the like, and grass with a road or a fire on it', () => {
    expect(groundIsNotable({ ground: 'deepWater', notes: [] })).toBe(true)
    expect(groundIsNotable({ ground: 'grass', notes: ['track'] })).toBe(true)
    expect(groundIsNotable({ ground: 'grass', notes: ['fertile', 'onFire'] })).toBe(true)
    expect(groundIsNotable(null)).toBe(false)
  })
})
