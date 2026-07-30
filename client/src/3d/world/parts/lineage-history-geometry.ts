import { Color } from 'three'
import type { WorldState } from '../../../types'
import { lineageColor } from '../../../utils/constants'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'

type History = NonNullable<WorldState['lineage_centroid_history']>

export interface LineageHistoryGeometryInput {
  history: History
  depthMap: number[][]
  biomes: number[][]
  originX: number
  originY: number
}

export interface LineageHistoryGeometryData {
  positions: Float32Array
  colors: Float32Array
}

export function buildLineageHistoryGeometryData({
  history,
  depthMap,
  biomes,
  originX,
  originY,
}: LineageHistoryGeometryInput): LineageHistoryGeometryData {
  const positions: number[] = []
  const colors: number[] = []
  const height = depthMap.length
  const width = depthMap[0]?.length ?? 0

  for (const [lineageId, samples] of Object.entries(history)) {
    if (samples.length < 2) continue
    const color = new Color(lineageColor(lineageId))
    for (let i = 1; i < samples.length; i++) {
      const [, worldX0, worldY0] = samples[i - 1]
      const [, worldX1, worldY1] = samples[i]
      const x0 = worldX0 - originX
      const y0 = worldY0 - originY
      const x1 = worldX1 - originX
      const y1 = worldY1 - originY
      if (
        x0 < 0 ||
        y0 < 0 ||
        x1 < 0 ||
        y1 < 0 ||
        x0 >= width ||
        x1 >= width ||
        y0 >= height ||
        y1 >= height
      ) {
        continue
      }

      positions.push(
        (x0 + 0.5) * TILE_SCALE,
        heightAt(x0, y0, depthMap, biomes) + 0.5,
        (y0 + 0.5) * TILE_SCALE,
        (x1 + 0.5) * TILE_SCALE,
        heightAt(x1, y1, depthMap, biomes) + 0.5,
        (y1 + 0.5) * TILE_SCALE,
      )
      const startStrength = 0.3 + 0.7 * ((i - 1) / (samples.length - 1))
      const endStrength = 0.3 + 0.7 * (i / (samples.length - 1))
      colors.push(
        color.r * startStrength,
        color.g * startStrength,
        color.b * startStrength,
        color.r * endStrength,
        color.g * endStrength,
        color.b * endStrength,
      )
    }
  }

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
  }
}
