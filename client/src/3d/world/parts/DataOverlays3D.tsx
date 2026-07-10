import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, LinearFilter } from 'three'
import type { WorldState } from '../../../types'
import { heightAt } from './terrain-utils'
import { TILE_SCALE } from './constants'

interface Props {
  overlay: string
  world: WorldState
  depthMap: number[][]
  biomes: number[][]
  width: number
  height: number
}

const HOVER_Y = 0.3
const SUB = 2

function buildDrapeGeometry(
  width: number,
  height: number,
  depthMap: number[][],
  biomes: number[][],
): BufferGeometry {
  const cols = width * SUB + 1
  const rows = height * SUB + 1
  const positions = new Float32Array(cols * rows * 3)
  const uvs = new Float32Array(cols * rows * 2)
  for (let r = 0; r < rows; r++) {
    const ty = r / SUB
    for (let c = 0; c < cols; c++) {
      const tx = c / SUB
      const i = r * cols + c
      positions[i * 3 + 0] = tx * TILE_SCALE
      positions[i * 3 + 1] = heightAt(tx, ty, depthMap, biomes) + HOVER_Y
      positions[i * 3 + 2] = ty * TILE_SCALE
      uvs[i * 2 + 0] = tx / width
      uvs[i * 2 + 1] = 1 - ty / height
    }
  }
  const indices = new Uint32Array((cols - 1) * (rows - 1) * 6)
  let ii = 0
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c
      const b = a + 1
      const d = a + cols
      const e = d + 1
      indices[ii++] = a
      indices[ii++] = d
      indices[ii++] = b
      indices[ii++] = b
      indices[ii++] = d
      indices[ii++] = e
    }
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(positions, 3))
  geo.setAttribute('uv', new BufferAttribute(uvs, 2))
  geo.setIndex(new BufferAttribute(indices, 1))
  return geo
}

function drawOverlay(
  data: Uint8ClampedArray,
  overlay: string,
  world: WorldState,
  width: number,
  height: number,
) {
  const put = (col: number, row: number, r: number, g: number, b: number, a: number) => {
    const i = (row * width + col) * 4
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = Math.round(Math.min(1, a) * 255)
  }
  const grid = world.grid
  const organisms = (world.viewport_organisms ?? world.organisms ?? []).filter((o) => o.alive)

  if (overlay === 'hazard' && grid.hazard) {
    for (let row = 0; row < height; row++) {
      const r = grid.hazard[row]
      if (!r) continue
      for (let col = 0; col < width; col++) {
        const v = r[col] ?? 0
        if (v < 0.05) continue
        put(col, row, 220, 40, 30, Math.min(0.75, v * 0.9))
      }
    }
  }

  if (overlay === 'fertility' && grid.fertility) {
    for (let row = 0; row < height; row++) {
      const r = grid.fertility[row]
      if (!r) continue
      for (let col = 0; col < width; col++) {
        const v = r[col] ?? 0
        if (v < 0.1) continue
        put(col, row, 80, 200, 80, Math.min(0.55, v * 0.6))
      }
    }
  }

  if (overlay === 'structures' && grid.structure) {
    for (let row = 0; row < height; row++) {
      const r = grid.structure[row]
      if (!r) continue
      for (let col = 0; col < width; col++) {
        const v = r[col] ?? 0
        if (v < 0.05) continue
        put(col, row, 255, 170, 60, Math.min(0.7, v * 0.8))
      }
    }
  }

  if (overlay === 'trails') {
    for (let row = 0; row < height; row++) {
      const fr = grid.food_trail?.[row]
      const wr = grid.water_trail?.[row]
      const pr = grid.path_trail?.[row]
      for (let col = 0; col < width; col++) {
        const f = fr?.[col] ?? 0
        const w = wr?.[col] ?? 0
        const p = pr?.[col] ?? 0
        if (f < 0.05 && w < 0.05 && p < 0.05) continue
        put(
          col,
          row,
          Math.min(255, Math.round(255 * f + 70 * w + 40 * p)),
          Math.min(255, Math.round(200 * f + 130 * w + 200 * p)),
          Math.min(255, Math.round(40 * f + 220 * w + 70 * p)),
          Math.min(0.65, (f + w + p) * 0.5),
        )
      }
    }
  }

  if (overlay === 'age') {
    const n = width * height
    const sum = new Float32Array(n)
    const cnt = new Float32Array(n)
    for (const org of organisms) {
      const tx = Math.round(org.x)
      const ty = Math.round(org.y)
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = tx + dx
          const ny = ty + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const idx = ny * width + nx
          sum[idx] += org.age
          cnt[idx] += 1
        }
      }
    }
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const idx = row * width + col
        if (cnt[idx] === 0) continue
        const t = Math.min(1, sum[idx] / cnt[idx] / 3000)
        put(col, row, Math.round(80 + t * 175), Math.round(220 - t * 140), Math.round(180 - t * 160), 0.55)
      }
    }
  }

  if (overlay === 'threat') {
    const n = width * height
    const heat = new Float32Array(n)
    const R = 3
    for (const org of organisms) {
      const f = org.fear_level ?? 0
      if (f < 0.3) continue
      const tx = Math.round(org.x)
      const ty = Math.round(org.y)
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.abs(dx) + Math.abs(dy)
          if (d > R) continue
          const nx = tx + dx
          const ny = ty + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          heat[ny * width + nx] += (f * (R - d + 1)) / (R + 1)
        }
      }
    }
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const v = heat[row * width + col]
        if (v < 0.15) continue
        const t = Math.min(1, v / 2)
        put(col, row, 255, Math.round(140 - t * 100), Math.round(60 - t * 40), 0.3 + t * 0.4)
      }
    }
  }

  if (overlay === 'density') {
    const n = width * height
    const heat = new Float32Array(n)
    const R = 4
    for (const org of organisms) {
      const tx = Math.round(org.x)
      const ty = Math.round(org.y)
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.abs(dx) + Math.abs(dy)
          if (d > R) continue
          const nx = tx + dx
          const ny = ty + dy
          if (nx >= 0 && ny >= 0 && ny < height && nx < width) {
            heat[ny * width + nx] += R - d + 1
          }
        }
      }
    }
    let maxD = 1
    for (let k = 0; k < n; k++) if (heat[k] > maxD) maxD = heat[k]
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const v = heat[row * width + col]
        if (v < 1) continue
        const t = Math.min(v / maxD, 1)
        put(
          col,
          row,
          Math.round(80 + t * 175),
          Math.round(200 - t * 100),
          Math.round(255 - t * 200),
          0.25 + t * 0.45,
        )
      }
    }
  }
}

export function DataOverlays3D({ overlay, world, depthMap, biomes, width, height }: Props) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const tex = new CanvasTexture(canvas)
    tex.minFilter = LinearFilter
    tex.magFilter = LinearFilter
    return tex
  }, [width, height])

  useEffect(() => () => texture.dispose(), [texture])

  const geometry = useMemo(
    () => buildDrapeGeometry(width, height, depthMap, biomes),
    [width, height, depthMap, biomes],
  )

  useEffect(() => () => geometry.dispose(), [geometry])

  useEffect(() => {
    const canvas = texture.image as HTMLCanvasElement
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(width, height)
    drawOverlay(img.data, overlay, world, width, height)
    ctx.putImageData(img, 0, 0)
    texture.needsUpdate = true
  }, [overlay, world, texture, width, height])

  return (
    <mesh geometry={geometry} renderOrder={3}>
      <meshBasicMaterial map={texture} transparent depthWrite={false} side={DoubleSide} />
    </mesh>
  )
}
