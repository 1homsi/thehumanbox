import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ERA_HOMES, eraHome } from './era-home-catalog'
import { hasBuildingSprite } from './building-sprites'
import { buildingEmoji, buildingFootprint } from './buildings2d'

const manifest = JSON.parse(
  readFileSync(new URL('../../../../assets/era-homes.json', import.meta.url), 'utf8'),
)

describe('era home catalog integration', () => {
  it('adds exactly 30 named, distinct homes to every authoritative simulation era', () => {
    const source = readFileSync(
      new URL('../../../../simulation/sim-core/src/sim/civ/eras/mod.rs', import.meta.url),
      'utf8',
    )
    const eras = [
      ...source
        .split('pub const LADDER:')[1]
        .split('];')[0]
        .matchAll(/Era::(\w+)/g),
    ].map((match) => match[1])
    expect(manifest.eras.map((era: { rustEra: string }) => era.rustEra)).toEqual(eras)
    expect(ERA_HOMES).toHaveLength(1050)
    expect(new Set(ERA_HOMES.map((home) => home.kind)).size).toBe(1050)
    expect(new Set(ERA_HOMES.map((home) => home.wire)).size).toBe(1050)
    for (const era of manifest.eras) {
      const homes = ERA_HOMES.filter((home) => home.era === era.era)
      expect(homes).toHaveLength(30)
      expect(new Set(homes.map((home) => `${home.form}:${home.layout}`)).size).toBe(30)
    }
  })
  it('resolves every simulation wire name to the correct sprite, footprint and home icon', () => {
    for (const home of ERA_HOMES) {
      expect(eraHome(home.kind)).toBe(home)
      expect(eraHome(home.wire)).toBe(home)
      expect(hasBuildingSprite(home.kind)).toBe(true)
      expect(buildingFootprint(home.kind)).toEqual(home.footprint)
      expect(buildingFootprint(home.wire)).toEqual(home.footprint)
      expect(buildingEmoji(home.wire)).toBe('🏠')
    }
    expect(eraHome('does_not_exist')).toBeUndefined()
  })
  it('keeps the generated metadata aligned with its shared source', () => {
    for (const era of manifest.eras) {
      for (const source of era.homes) {
        expect(eraHome(source.kind)).toEqual({
          ...source,
          ...Object.fromEntries(Object.entries(era).filter(([key]) => !['homes', 'rustEra'].includes(key))),
        })
      }
    }
  })
})
