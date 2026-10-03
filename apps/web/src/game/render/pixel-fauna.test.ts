import { describe, expect, it } from 'vitest'
import { hasPixelFauna } from './pixel-fauna'

describe('pixel fauna', () => {
  it('draws every monster the dock can summon', () => {
    for (const kind of ['zombie', 'demon', 'dragon', 'alien', 'ufo']) {
      expect(hasPixelFauna(kind), kind).toBe(true)
    }
  })
})
