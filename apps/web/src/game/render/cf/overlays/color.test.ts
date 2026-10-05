import { describe, expect, it } from 'vitest'
import { packColor, packRgba, parseColor } from './color'

describe('CSS colours for sprites and tiles', () => {
  it('parses hex, rgb(a) and hsl(a), the forms the painters use', () => {
    expect(parseColor('#f80')).toEqual({ r: 255, g: 136, b: 0, a: 1 })
    expect(parseColor('#336699cc')).toEqual({ r: 51, g: 102, b: 153, a: 0.8 })
    expect(parseColor('rgba(10, 20, 30, 0.25)')).toEqual({ r: 10, g: 20, b: 30, a: 0.25 })
    expect(parseColor('rgb(300,0,0)').r).toBe(255)
    const hsl = parseColor('hsl(120, 100%, 50%)')
    expect([hsl.r, hsl.g, hsl.b]).toEqual([0, 255, 0])
    const hsla = parseColor('hsla(0, 100%, 50%, 0.5)')
    expect([hsla.r, hsla.g, hsla.b, hsla.a]).toEqual([255, 0, 0, 0.5])
  })

  it('parses the lineage colours the game generates', () => {
    const c = parseColor('hsl(214, 62%, 55%)')
    expect(c.b).toBeGreaterThan(c.r)
    expect(c.a).toBe(1)
  })

  it('packs to 0xRRGGBBAA with the alpha multiplied in', () => {
    expect(packRgba(255, 0, 0, 1)).toBe(0xff0000ff)
    expect(packRgba(0, 255, 0, 0.5) >>> 0).toBe(0x00ff0080)
    expect(packColor('rgba(0,0,255,0.5)', 0.5)).toBe(0x0000ff40)
    expect(packRgba(1, 2, 3, -1)).toBe(0x01020300)
  })

  it('falls back to white for what it cannot read', () => {
    expect(parseColor('banana')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
  })
})
