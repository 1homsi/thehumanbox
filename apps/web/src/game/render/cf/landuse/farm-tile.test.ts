import { describe, expect, it } from 'vitest'
import { farmCropStyle } from './farm-tile'

describe('farmCropStyle', () => {
  it('gives each crop family its own silhouette', () => {
    expect(farmCropStyle('wheat')).toBe('grain')
    expect(farmCropStyle('barley')).toBe('grain')
    expect(farmCropStyle('rice')).toBe('paddy')
    expect(farmCropStyle('maize')).toBe('stalk')
    expect(farmCropStyle('potato')).toBe('mound')
    expect(farmCropStyle('beans')).toBe('vine')
    expect(farmCropStyle('cotton')).toBe('tuft')
    expect(farmCropStyle('tobacco')).toBe('leaf')
    expect(farmCropStyle('sugarcane')).toBe('cane')
    expect(farmCropStyle('coffee')).toBe('shrub')
    expect(farmCropStyle('tea')).toBe('shrub')
  })

  it('is case-insensitive and falls back to grain for unknown or missing crops', () => {
    expect(farmCropStyle('Rice')).toBe('paddy')
    expect(farmCropStyle('quinoa')).toBe('grain')
    expect(farmCropStyle(undefined)).toBe('grain')
  })
})
