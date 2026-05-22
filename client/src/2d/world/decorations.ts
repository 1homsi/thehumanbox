/**
 * Cosmetic / atmospheric decorations rendered onto the 2D world
 * canvas: trees (drawn into the cached base layer), clouds, and
 * shared scratch buffers. Extracted from WorldView.tsx so the
 * orchestrator file can stay focused on the per-frame pipeline.
 */

import { SPRITE, ATLAS_TOWN, drawTile } from '../../utils/sprites'
import type { WorldState } from '../../types'
import { TILE } from '../../world/palette'

export function drawCloudShape(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cloudW: number,
  cloudH: number,
  alpha: number,
  color: string,
  bumpSeed: number,
) {
  let state = bumpSeed | 0 || 1
  const rand = () => {
    state = (state * 1664525 + 1013904223) | 0
    return ((state >>> 0) % 10000) / 10000
  }

  const drawPuff = (px: number, py: number, pr: number, pa: number) => {
    const g = ctx.createRadialGradient(px, py, 0, px, py, pr)
    g.addColorStop(0, `rgba(${color},${pa})`)
    g.addColorStop(0.55, `rgba(${color},${pa * 0.7})`)
    g.addColorStop(0.85, `rgba(${color},${pa * 0.25})`)
    g.addColorStop(1, `rgba(${color},0)`)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(px, py, pr, 0, Math.PI * 2)
    ctx.fill()
  }

  drawPuff(cx, cy + cloudH * 0.15, Math.max(cloudW, cloudH) * 0.85, alpha * 0.9)

  const nPuffs = 8 + Math.floor(rand() * 5)
  for (let p = 0; p < nPuffs; p++) {
    const t = p / (nPuffs - 1)
    const edgeBias = 1 - Math.abs(t - 0.5) * 1.6
    const px = cx + (t - 0.5) * cloudW * 1.55 + (rand() - 0.5) * cloudW * 0.25
    const py = cy - cloudH * (0.05 + rand() * 0.5 * edgeBias)
    const pr = cloudH * (0.45 + rand() * 0.55 * edgeBias)
    drawPuff(px, py, pr, alpha * (0.55 + rand() * 0.45))
  }
}

export function drawTrees(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tiles: number[][],
  biomes?: number[][],
) {
  if (!biomes || !ATLAS_TOWN.complete) return
  const TILE_GRASS = 1
  const TILE_FOOD = 3
  const BIOME_GRASS = 0
  const BIOME_FOREST = 1
  const BIOME_DESERT = 2
  const BIOME_TUNDRA = 3
  const BIOME_WETLAND = 4
  const BIOME_VOLCANIC = 5

  const TREE_SIZE = 16

  const placed: Uint8Array = new Uint8Array(width * height)
  const order: number[] = []
  for (let i = 0; i < width * height; i++) order.push(i)
  for (let i = order.length - 1; i > 0; i--) {
    const r = (i * 2654435761) >>> 0
    const j = r % (i + 1)
    const tmp = order[i]
    order[i] = order[j]
    order[j] = tmp
  }

  for (const idx of order) {
    const x = idx % width
    const y = Math.floor(idx / width)
    const tRow = tiles[y]
    const bRow = biomes[y]
    if (!tRow || !bRow) continue
    const t = tRow[x]
    if (t !== TILE_GRASS && t !== TILE_FOOD) continue
    const biome = bRow[x] ?? 0

    let hash = (x * 73856093) ^ (y * 19349663)
    hash = ((hash ^ (hash >>> 13)) * 0x5bd1e995) >>> 0
    const r0 = (hash & 0xff) / 255
    const r1 = ((hash >>> 8) & 0xff) / 255

    let chance = 0
    let spacing = 2
    switch (biome) {
      case BIOME_FOREST:
        chance = 0.32
        spacing = 2
        break
      case BIOME_WETLAND:
        chance = 0.18
        spacing = 3
        break
      case BIOME_GRASS:
        chance = 0.06
        spacing = 5
        break
      case BIOME_TUNDRA:
        chance = 0.1
        spacing = 4
        break
      case BIOME_DESERT:
        chance = 0.03
        spacing = 6
        break
      case BIOME_VOLCANIC:
        chance = 0.05
        spacing = 4
        break
    }
    if (r0 > chance) continue

    let too_close = false
    for (let dy = -spacing; dy <= spacing && !too_close; dy++) {
      for (let dx = -spacing; dx <= spacing && !too_close; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        if (placed[ny * width + nx]) too_close = true
      }
    }
    if (too_close) continue

    placed[y * width + x] = 1

    const sz = TREE_SIZE * (0.85 + ((r1 * 17) % 1) * 0.4)
    const cx = x * TILE + (TILE - sz) / 2 + (r1 - 0.5) * TILE * 0.5
    const cy = y * TILE + (TILE - sz) / 2 + (((r0 * 7) % 1) - 0.5) * TILE * 0.5

    let sprite = SPRITE.trees.oak_mid
    switch (biome) {
      case BIOME_FOREST:
        sprite = r1 < 0.45 ? SPRITE.trees.conifer : r1 < 0.75 ? SPRITE.trees.oak_dark : SPRITE.trees.oak_mid
        break
      case BIOME_WETLAND:
        sprite = r1 < 0.6 ? SPRITE.trees.bush : SPRITE.trees.oak_mid
        break
      case BIOME_GRASS:
        sprite = r1 < 0.6 ? SPRITE.trees.oak_light : SPRITE.trees.oak_mid
        break
      case BIOME_TUNDRA:
        sprite = SPRITE.trees.conifer_dk
        break
      case BIOME_DESERT:
        sprite = r1 < 0.5 ? SPRITE.trees.cactus : SPRITE.trees.dead
        break
      case BIOME_VOLCANIC:
        sprite = SPRITE.trees.dead
        break
    }
    drawTile(ctx, ATLAS_TOWN, sprite, cx, cy, sz)
  }
}

export function drawNaturalDecor(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tiles: number[][],
  biomes?: number[][],
) {
  if (!biomes) return
  const TILE_GRASS = 1
  const TILE_FOOD = 3
  const TILE_WATER = 0
  const TILE_SAND = 13
  const TILE_SNOW = 12
  const TILE_ROCK = 5
  const BIOME_GRASS = 0
  const BIOME_FOREST = 1
  const BIOME_DESERT = 2
  const BIOME_TUNDRA = 3
  const BIOME_WETLAND = 4

  ctx.save()
  for (let y = 1; y < height - 1; y++) {
    const tRow = tiles[y]
    const bRow = biomes[y]
    if (!tRow || !bRow) continue
    for (let x = 1; x < width - 1; x++) {
      const t = tRow[x]
      const biome = bRow[x] ?? 0
      let hash = ((x * 374761393) ^ (y * 668265263)) >>> 0
      hash = ((hash ^ (hash >>> 13)) * 1274126177) >>> 0
      const r0 = (hash & 0xff) / 255
      const r1 = ((hash >>> 8) & 0xff) / 255
      const r2 = ((hash >>> 16) & 0xff) / 255
      const px = x * TILE
      const py = y * TILE

      if (t === TILE_ROCK || (t === TILE_SAND && biome === BIOME_DESERT && r0 < 0.04)) {
        const sz = 2 + Math.floor(r1 * 3)
        ctx.fillStyle = t === TILE_ROCK ? '#5e5650' : '#8a7654'
        ctx.beginPath()
        ctx.ellipse(
          px + TILE / 2 + (r2 - 0.5) * TILE * 0.4,
          py + TILE / 2 + (r0 - 0.5) * TILE * 0.4,
          sz,
          sz * 0.7,
          0,
          0,
          Math.PI * 2,
        )
        ctx.fill()
        continue
      }
      if (t === TILE_SNOW && r0 < 0.18) {
        ctx.fillStyle = 'rgba(245,250,255,0.7)'
        ctx.beginPath()
        ctx.ellipse(
          px + TILE / 2 + (r2 - 0.5) * TILE * 0.3,
          py + TILE / 2 + (r1 - 0.5) * TILE * 0.3,
          2 + r2 * 2,
          1 + r1,
          0,
          0,
          Math.PI * 2,
        )
        ctx.fill()
        continue
      }
      if (t !== TILE_GRASS && t !== TILE_FOOD) continue

      if (biome === BIOME_GRASS && r0 < 0.08) {
        const colors = ['#d65a78', '#e8c044', '#a87fd6', '#e58a3a']
        ctx.fillStyle = colors[Math.floor(r2 * colors.length)]
        const fx = px + TILE / 2 + (r1 - 0.5) * TILE * 0.4
        const fy = py + TILE / 2 + (r2 - 0.5) * TILE * 0.4
        ctx.fillRect(fx - 1, fy - 1, 3, 3)
        ctx.fillStyle = '#3a6b32'
        ctx.fillRect(fx, fy + 1, 1, 2)
      } else if (biome === BIOME_FOREST && r0 < 0.06) {
        const mx = px + TILE / 2 + (r2 - 0.5) * TILE * 0.4
        const my = py + TILE / 2 + (r1 - 0.5) * TILE * 0.4
        ctx.fillStyle = r1 < 0.5 ? '#c54a4a' : '#ddd5b8'
        ctx.beginPath()
        ctx.arc(mx, my, 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#f0e8d8'
        ctx.fillRect(mx - 1, my + 1, 2, 2)
      } else if ((biome === BIOME_GRASS || biome === BIOME_WETLAND) && r1 < 0.12) {
        ctx.strokeStyle = biome === BIOME_WETLAND ? '#5a8848' : '#7ea860'
        ctx.lineWidth = 1
        const gx = px + TILE / 2 + (r0 - 0.5) * TILE * 0.5
        const gy = py + TILE - 1
        ctx.beginPath()
        ctx.moveTo(gx, gy)
        ctx.lineTo(gx + (r2 - 0.5) * 2, gy - 3)
        ctx.moveTo(gx + 1, gy)
        ctx.lineTo(gx + 1 + (r2 - 0.5) * 2, gy - 2)
        ctx.stroke()
      } else if (biome === BIOME_TUNDRA && r0 < 0.08) {
        ctx.fillStyle = 'rgba(220,225,235,0.55)'
        ctx.beginPath()
        ctx.ellipse(
          px + TILE / 2 + (r2 - 0.5) * TILE * 0.4,
          py + TILE / 2 + (r1 - 0.5) * TILE * 0.4,
          2.5,
          1.4,
          0,
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }

      if (r2 < 0.003) {
        ctx.fillStyle = 'rgba(220,210,190,0.55)'
        ctx.fillRect(px + TILE / 2 - 1, py + TILE / 2, 3, 1)
        ctx.fillRect(px + TILE / 2 - 1, py + TILE / 2 + 1, 2, 1)
      }
    }
  }

  for (let y = 1; y < height - 1; y++) {
    const tRow = tiles[y]
    if (!tRow) continue
    for (let x = 1; x < width - 1; x++) {
      if (tRow[x] !== TILE_WATER) continue
      const above = tiles[y - 1]?.[x]
      const below = tiles[y + 1]?.[x]
      const left = tRow[x - 1]
      const right = tRow[x + 1]
      const landGrass = (n: number | undefined) => n === TILE_GRASS || n === TILE_FOOD
      if (!landGrass(above) && !landGrass(below) && !landGrass(left) && !landGrass(right)) continue
      let hash = ((x * 374761393) ^ (y * 668265263)) >>> 0
      hash = ((hash ^ (hash >>> 13)) * 1274126177) >>> 0
      if ((hash & 0xff) > 110) continue
      const r1 = ((hash >>> 8) & 0xff) / 255
      const r2 = ((hash >>> 16) & 0xff) / 255
      ctx.strokeStyle = '#3e6b3a'
      ctx.lineWidth = 1
      const px = x * TILE + TILE / 2 + (r2 - 0.5) * TILE * 0.5
      const py = y * TILE + TILE
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px + (r1 - 0.5) * 2, py - 4)
      ctx.moveTo(px + 1, py)
      ctx.lineTo(px + 1 + (r1 - 0.5) * 2, py - 3)
      ctx.stroke()
    }
  }
  ctx.restore()
}

export function drawClouds(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  weather: WorldState['weather'],
  t: number,
) {
  if (!weather || weather.kind === 'clear') return
  const isStorm = weather.kind === 'storm'
  const count = isStorm ? 9 : 5
  const baseAlpha = weather.intensity * (isStorm ? 0.62 : 0.38)
  const color = isStorm ? '16,20,42' : '130,148,170'

  ctx.save()
  for (let i = 0; i < count; i++) {
    const seed = (i + 1) * 137
    const baseX = (((seed * 73) % 1000) / 1000) * W
    const baseY = isStorm
      ? ((((seed * 41) % 750) / 750) * 0.75 + 0.1) * H
      : ((((seed * 41) % 600) / 600) * 0.6 + 0.05) * H
    const speed = 0.014 + (i % 5) * 0.006
    const cx = ((baseX + t * speed) % (W + 360)) - 180
    const cy = baseY

    const cloudW = W * (0.09 + (i % 4) * 0.055)
    const cloudH = cloudW * (0.28 + (i % 3) * 0.07)
    const alpha = baseAlpha * (0.75 + (0.25 * ((i * 13 + 7) % 10)) / 10)

    drawCloudShape(ctx, cx, cy, cloudW, cloudH, alpha, color, i * 7 + 3)

    if (isStorm) {
      drawCloudShape(
        ctx,
        cx + cloudW * 0.08,
        cy + cloudH * 0.25,
        cloudW * 0.88,
        cloudH * 0.7,
        alpha * 0.55,
        '8,10,24',
        i * 5 + 11,
      )
    }
  }
  ctx.restore()
}

// Module-scoped scratch buffers - reused across frames so the
// per-tick allocations don't churn GC. Each accessor zeroes the
// requested length before handing back, so the caller can treat
// it as a freshly-zeroed array.
let _scratchA: Float32Array | null = null
let _scratchB: Float32Array | null = null
export function scratchA(n: number): Float32Array {
  if (!_scratchA || _scratchA.length < n) _scratchA = new Float32Array(n)
  else _scratchA.fill(0, 0, n)
  return _scratchA
}
export function scratchB(n: number): Float32Array {
  if (!_scratchB || _scratchB.length < n) _scratchB = new Float32Array(n)
  else _scratchB.fill(0, 0, n)
  return _scratchB
}
