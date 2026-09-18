import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BUILDING_SPRITE_KINDS, hasBuildingSprite } from './building-sprites'

describe('building asset coverage', () => {
  it('has a pixel-art painter for every authoritative simulation building', () => {
    const source = readFileSync(
      new URL('../../../../simulation/sim-core/src/sim/tech/buildings.rs', import.meta.url),
      'utf8',
    )
    const body = source.split('pub enum BuildingKind {')[1].split('}')[0]
    const kinds = [...body.matchAll(/^ {4}(\w+),/gm)].map((match) => match[1])
    expect(kinds.length).toBeGreaterThan(150)
    expect(kinds.filter((kind) => !hasBuildingSprite(kind))).toEqual([])
    expect(new Set(BUILDING_SPRITE_KINDS).size).toBe(BUILDING_SPRITE_KINDS.length)
  })
})
