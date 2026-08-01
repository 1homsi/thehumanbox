import { describe, expect, it } from 'vitest'
import {
  CREATURE_ATLAS,
  CUSTOM_PIXEL_ANIMAL_KINDS,
  pickAnimalTile,
  SPRITE,
  TILE_PX,
  type AtlasAnimalSpriteKind,
  type Tile,
} from './sprite-layout'

const animalEntries = Object.entries(SPRITE.animals) as [AtlasAnimalSpriteKind, readonly Tile[]][]

describe('Tiny Creatures sprite layout', () => {
  it('matches the checked-in 10 by 18 atlas contract', () => {
    expect(CREATURE_ATLAS).toEqual({
      width: 160,
      height: 288,
      columns: 10,
      rows: 18,
      cell: TILE_PX,
    })
    expect(CREATURE_ATLAS.width).toBe(CREATURE_ATLAS.columns * TILE_PX)
    expect(CREATURE_ATLAS.height).toBe(CREATURE_ATLAS.rows * TILE_PX)
  })

  it('keeps every animal tile inside the atlas', () => {
    for (const [species, tiles] of animalEntries) {
      expect(tiles.length, `${species} has no sprite variants`).toBeGreaterThan(0)
      for (const [column, row] of tiles) {
        expect(column, `${species} column`).toBeGreaterThanOrEqual(0)
        expect(column, `${species} column`).toBeLessThan(CREATURE_ATLAS.columns)
        expect(row, `${species} row`).toBeGreaterThanOrEqual(0)
        expect(row, `${species} row`).toBeLessThan(CREATURE_ATLAS.rows)
      }
    }
  })

  it('does not accidentally reuse another species sprite', () => {
    const owners = new Map<string, AtlasAnimalSpriteKind>()
    for (const [species, tiles] of animalEntries) {
      for (const tile of tiles) {
        const key = tile.join(',')
        expect(owners.get(key), `${key} is shared by ${owners.get(key)} and ${species}`).toBeUndefined()
        owners.set(key, species)
      }
    }
  })

  it('keeps related variants together without mixing creature families', () => {
    expect(SPRITE.animals.rabbit).toEqual([[7, 17]])
    expect(SPRITE.animals.deer).toEqual([[1, 16]])
    expect(SPRITE.animals.boar).toEqual([[0, 16]])
    expect(SPRITE.animals.fish.every(([, row]) => row === 6 || row === 7)).toBe(true)
    expect(SPRITE.animals.bird.every(([, row]) => row === 13)).toBe(true)
  })

  it('reserves wolves and dogs for purpose-built pixel art', () => {
    expect(CUSTOM_PIXEL_ANIMAL_KINDS).toEqual(['wolf', 'dog'])
    expect(pickAnimalTile('wolf', 1)).toBeNull()
    expect(pickAnimalTile('dog', 1)).toBeNull()
    expect('wolf' in SPRITE.animals).toBe(false)
    expect('dog' in SPRITE.animals).toBe(false)
  })

  it('selects variants deterministically and falls back to a rabbit', () => {
    const firstPass = Array.from({ length: 12 }, (_, id) => pickAnimalTile('fish', id))
    const secondPass = Array.from({ length: 12 }, (_, id) => pickAnimalTile('fish', id))

    expect(secondPass).toEqual(firstPass)
    expect(new Set(firstPass.map((tile) => tile?.join(','))).size).toBeGreaterThan(1)
    expect(pickAnimalTile('unknown-species', 42)).toEqual([7, 17])
    expect(pickAnimalTile('deer', -19)).toEqual(pickAnimalTile('deer', -19))
  })
})
