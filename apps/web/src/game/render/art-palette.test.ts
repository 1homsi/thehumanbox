import { describe, expect, it } from 'vitest'
import { hex, OCEAN } from './art-palette'

describe('art palette', () => {
  it('writes a palette colour as a CSS hex', () => {
    expect(hex(OCEAN.deep)).toBe('#253a5e')
  })
})
