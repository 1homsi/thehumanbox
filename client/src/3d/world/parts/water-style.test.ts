import { describe, expect, it } from 'vitest'
import { waterColorAt, waterTileAt } from './water-style'

describe('3D water alignment and day cycle', () => {
  it('maps the rotated plane to the correct north/south terrain rows', () => {
    expect(waterTileAt(-100, 50, 100, 50, 2)).toEqual([0, 0])
    expect(waterTileAt(100, -50, 100, 50, 2)).toEqual([99, 49])
    expect(waterTileAt(0, 0, 100, 50, 2)).toEqual([50, 25])
  })
  it('wraps smoothly through midnight', () => {
    expect(waterColorAt(0)).toEqual(waterColorAt(1))
    expect(waterColorAt(-0.25)).toEqual(waterColorAt(0.75))
    waterColorAt(0.99999).forEach((channel, i) => {
      expect(channel).toBeCloseTo(waterColorAt(0)[i], 3)
    })
  })
})
