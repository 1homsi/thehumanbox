import { describe, expect, it } from 'vitest'
import { TILE_SCALE } from './constants'
import { buildLineageHistoryGeometryData } from './lineage-history-geometry'

describe('3D lineage history trails', () => {
  it('renders absolute history samples in viewport-local space', () => {
    const data = buildLineageHistoryGeometryData({
      history: {
        'lin-a': [
          [10, 33, 17],
          [20, 34, 18],
        ],
      },
      depthMap: Array.from({ length: 4 }, () => [255, 255, 255, 255]),
      biomes: Array.from({ length: 4 }, () => [0, 0, 0, 0]),
      originX: 32,
      originY: 16,
    })

    expect(data.positions).toHaveLength(6)
    expect(data.positions[0]).toBe((1 + 0.5) * TILE_SCALE)
    expect(data.positions[2]).toBe((1 + 0.5) * TILE_SCALE)
    expect(data.positions[3]).toBe((2 + 0.5) * TILE_SCALE)
    expect(data.positions[5]).toBe((2 + 0.5) * TILE_SCALE)
    expect(data.colors).toHaveLength(6)
  })
})
