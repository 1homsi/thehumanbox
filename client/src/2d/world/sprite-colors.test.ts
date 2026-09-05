import { describe, expect, it } from 'vitest'
import { hueShift, shade } from './sprite-colors'

describe('building material colors', () => {
  it('preserves an unshifted material and rotates primary hues', () => {
    expect(hueShift('#a6845a', 0)).toBe('#a6845a')
    expect(hueShift('#ff0000', 120)).toBe('#00ff00')
    expect(hueShift('#ff0000', 240)).toBe('#0000ff')
  })
  it('keeps tinted and already-shaded walls usable by further shading passes', () => {
    const tinted = hueShift('#a6845a', 12)
    expect(tinted).toMatch(/^#[0-9a-f]{6}$/)
    expect(shade(tinted, 0.78)).not.toBe('#000000')
    expect(shade(shade('#a6845a', 1.06), 0.78)).toMatch(/^#[0-9a-f]{6}$/)
    expect(shade('#000000', 1.2)).toBe('#333333')
    expect(shade('#ffffff', 0.5)).toBe('#808080')
  })
})
