import { describe, expect, it } from 'vitest'
import { Color } from 'three'
import { getWildernessPalette } from './wilderness-palette'

function luminance(hex: string): number {
  const color = new Color(hex)
  return color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722
}

describe('wilderness atmosphere palette', () => {
  it('keeps sunset warm and layers ridges from haze to silhouette', () => {
    const palette = getWildernessPalette(0.78)
    const horizon = new Color(palette.skyHorizon)
    expect(horizon.r).toBeGreaterThan(horizon.b)
    expect(luminance(palette.skyHorizon)).toBeGreaterThan(luminance(palette.skyTop))
    expect(luminance(palette.ridgeFar)).toBeGreaterThan(luminance(palette.ridgeMid))
    expect(luminance(palette.ridgeMid)).toBeGreaterThan(luminance(palette.ridgeNear))
  })

  it('grades rain cooler without erasing the sunset color hierarchy', () => {
    const clear = getWildernessPalette(0.78, 'clear')
    const rain = getWildernessPalette(0.78, 'rain')
    expect(new Color(rain.skyHorizon).r).toBeLessThan(new Color(clear.skyHorizon).r)
    expect(luminance(rain.ridgeFar)).toBeGreaterThan(luminance(rain.ridgeNear))
    expect(rain.exposure).toBeLessThan(clear.exposure)
  })

  it('clamps invalid day progress values to the authored cycle', () => {
    expect(getWildernessPalette(-1)).toEqual(getWildernessPalette(0))
    expect(getWildernessPalette(2)).toEqual(getWildernessPalette(1))
  })
})
