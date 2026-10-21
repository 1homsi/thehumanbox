import { describe, expect, it } from 'vitest'
import { hasPixelFauna, pixelFaunaDims, pixelFaunaKinds } from './pixel-fauna'

describe('pixel fauna', () => {
  it('draws every monster the dock can summon', () => {
    for (const kind of ['zombie', 'demon', 'dragon', 'alien', 'ufo']) {
      expect(hasPixelFauna(kind), kind).toBe(true)
    }
  })

  it('keeps every species within a 16x16 native pixel cell', () => {
    for (const kind of pixelFaunaKinds()) {
      const dims = pixelFaunaDims(kind)
      expect(dims, kind).not.toBeNull()
      expect(dims!.cols, `${kind} cols`).toBeGreaterThanOrEqual(4)
      expect(dims!.cols, `${kind} cols`).toBeLessThanOrEqual(16)
      expect(dims!.rows, `${kind} rows`).toBeGreaterThanOrEqual(4)
      expect(dims!.rows, `${kind} rows`).toBeLessThanOrEqual(16)
    }
  })
})
