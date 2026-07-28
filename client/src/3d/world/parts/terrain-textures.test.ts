import { describe, expect, it } from 'vitest'
import { BIOME_ID } from '../../../world/terrain-ids'
import { biomeQuadrant } from './terrain-textures'

describe('3D biome textures', () => {
  it('uses wet ground for wetlands and rock for tundra', () => {
    expect(biomeQuadrant(BIOME_ID.WETLAND)).toBe(3)
    expect(biomeQuadrant(BIOME_ID.TUNDRA)).toBe(2)
  })

  it('keeps the primary biome texture assignments distinct', () => {
    expect(biomeQuadrant(BIOME_ID.GRASSLAND)).toBe(0)
    expect(biomeQuadrant(BIOME_ID.DESERT)).toBe(1)
    expect(biomeQuadrant(BIOME_ID.VOLCANIC)).toBe(2)
    expect(biomeQuadrant(BIOME_ID.FOREST)).toBe(3)
  })
})
