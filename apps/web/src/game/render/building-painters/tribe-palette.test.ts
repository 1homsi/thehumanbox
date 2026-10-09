import { describe, expect, it } from 'vitest'
import { mixHex } from '../sprite-colors'
import { TRIBE_ROOF_TINTS, hashId, roofTintFor, tribeTintIndex } from './tribe-palette'

describe('tribe roof palette', () => {
  it('gives the same tribe the same roof colour every time', () => {
    expect(tribeTintIndex('a78d6ac1')).toBe(tribeTintIndex('a78d6ac1'))
    expect(roofTintFor('House', 'a78d6ac1')).toBe(roofTintFor('House', 'a78d6ac1'))
  })

  it('spreads tribes over all four roof colours', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `tribe${i}`)
    const used = new Set(ids.map((id) => tribeTintIndex(id)))
    expect([...used].sort()).toEqual([0, 1, 2, 3])
  })

  it('tints only the homes with their own roofs', () => {
    expect(roofTintFor('Hut', 'a')).toBeDefined()
    expect(roofTintFor('TownHouse', 'a')).toBeDefined()
    expect(roofTintFor('Tent', 'a')).toBeUndefined()
    expect(roofTintFor('Shrine', 'a')).toBeUndefined()
    // A building with no tribe (ruins of a dead tribe, world buildings) keeps its colours.
    expect(roofTintFor('House', '')).toBeUndefined()
  })

  it('hashes ids to 32-bit numbers', () => {
    expect(hashId('x')).toBeGreaterThanOrEqual(0)
    expect(hashId('x')).toBeLessThan(2 ** 32)
    expect(hashId('x')).not.toBe(hashId('y'))
  })

  it('uses four distinct colours', () => {
    expect(new Set(TRIBE_ROOF_TINTS).size).toBe(4)
  })
})

describe('mixHex', () => {
  it('keeps the first colour at 0 and gives the second at 1', () => {
    expect(mixHex('#102030', '#f0e0d0', 0)).toBe('#102030')
    expect(mixHex('#102030', '#f0e0d0', 1)).toBe('#f0e0d0')
  })

  it('blends each channel halfway', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
})
