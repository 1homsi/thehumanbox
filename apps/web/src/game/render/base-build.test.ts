// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { BIOME_RGBA, SEASON_LAND_TINT, TILE, TILE_RGB } from '../model/palette'
import { TILE_ID, isPermanentWaterTile, isWaterTile } from '../model/terrain-ids'
import { baseTerrainTile, permanentWaterDepth } from '../model/terrain-visuals'
import { SHALLOW_RGB, paintTileBlock, valueNoise, varAmountForTile } from './base-layer'
import { oceanColor } from './landscape-style'
import { mountainHeights } from './mountains'
import { terrainDetail } from './terrain-detail'
import { treePlacementOrder } from './decorations'

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

// ---- Reference copies of the code these helpers replaced ----

function refOceanColor(wireDepth: number): [number, number, number] {
  const shallow = Math.max(0, Math.min(1, wireDepth / 200))
  const stops = [
    [24, 55, 91],
    [35, 105, 135],
    [75, 166, 172],
  ] as const
  const segment = shallow < 0.65 ? 0 : 1
  const blend = segment === 0 ? shallow / 0.65 : (shallow - 0.65) / 0.35
  return stops[segment].map((channel, index) =>
    Math.round(channel + (stops[segment + 1][index] - channel) * blend),
  ) as [number, number, number]
}

function refTerrainDetail(tile: number, x: number, y: number): number {
  const cellX = Math.floor(x / 6),
    cellY = Math.floor(y / 5)
  const hash = Math.imul(cellX, 374761393) ^ Math.imul(cellY, 668265263)
  const px = ((x % 6) + 6) % 6,
    py = ((y % 5) + 5) % 5
  if (tile === TILE_ID.SAND) {
    const ridge = (y + Math.floor(x / 12) + ((hash >>> 6) & 1)) % 7
    return ridge === 0 ? 9 : ridge === 1 ? -4 : 0
  }
  if (tile === TILE_ID.ROCK) return py === 1 && px < 4 ? 12 : py === 2 && px < 4 ? -8 : 0
  if (tile === TILE_ID.SNOW) return (hash & 7) === 0 && py === 2 && px < 3 ? 7 : 0
  if (tile === TILE_ID.GRASS || tile === TILE_ID.FOOD) {
    if ((hash & 3) !== 0) return 0
    return (px === 2 && py < 2) || (px === 3 && py === 2) ? 9 : py === 3 && px > 1 && px < 4 ? -5 : 0
  }
  return 0
}

function refPaintTileBlock(
  d: Uint8ClampedArray,
  W: number,
  tiles: number[][],
  biomes: number[][] | undefined,
  depth_map: number[][] | undefined,
  season: string | undefined,
  row: number,
  col: number,
) {
  const height = tiles.length
  const tileRow = tiles[row]
  const biomeRow = biomes?.[row]
  const depthRow = depth_map?.[row]
  const tileRowPrev = row > 0 ? tiles[row - 1] : undefined
  const tileRowNext = row + 1 < height ? tiles[row + 1] : undefined
  const rawTid = tileRow?.[col] ?? TILE_ID.VOID
  const tid = baseTerrainTile(rawTid)
  const rgb = TILE_RGB[tid] ?? TILE_RGB[0]
  let r = rgb[0]
  let g = rgb[1]
  let b = rgb[2]
  const isWater = isWaterTile(rawTid)
  const isPermanentWater = isPermanentWaterTile(rawTid)
  const wN = tileRowPrev?.[col]
  const wS = tileRowNext?.[col]
  const wW = col > 0 ? tileRow?.[col - 1] : undefined
  const wE = tileRow?.[col + 1]
  const touchesLand =
    (wN !== undefined && !isWaterTile(wN)) ||
    (wS !== undefined && !isWaterTile(wS)) ||
    (wW !== undefined && !isWaterTile(wW)) ||
    (wE !== undefined && !isWaterTile(wE))
  const visualDepth = permanentWaterDepth(rawTid, depthRow?.[col])
  if (visualDepth !== null) {
    ;[r, g, b] = refOceanColor(visualDepth)
  }
  if (isPermanentWater && touchesLand) {
    r = (r * 0.68 + SHALLOW_RGB[0] * 0.32) | 0
    g = (g * 0.68 + SHALLOW_RGB[1] * 0.32) | 0
    b = (b * 0.68 + SHALLOW_RGB[2] * 0.32) | 0
  }
  if (!isWater && tid !== TILE_ID.ROCK && tid !== TILE_ID.SNOW) {
    const bm = biomeRow?.[col] ?? 0
    const bo = BIOME_RGBA[bm]
    if (bo) {
      const a = bo[3]
      if (a > 0) {
        const ia = 1 - a
        r = (r * ia + bo[0] * a) | 0
        g = (g * ia + bo[1] * a) | 0
        b = (b * ia + bo[2] * a) | 0
      }
    }
  }
  const macro = valueNoise(col / 42, row / 42) * 0.65 + valueNoise(col / 13 + 7, row / 13 + 7) * 0.35
  let shading = ((macro - 0.5) * (isWater ? 5 : 25)) | 0
  if (!isWater) {
    const grassy = tid === 1 || tid === 3 || tid === 6 || tid === 13
    const landTint = SEASON_LAND_TINT[season ?? '']
    if (grassy && landTint) {
      let w = landTint.w * (0.55 + macro * 0.9)
      if (w > 0.85) w = 0.85
      const iw = 1 - w
      r = (r * iw + landTint.rgb[0] * w) | 0
      g = (g * iw + landTint.rgb[1] * w) | 0
      b = (b * iw + landTint.rgb[2] * w) | 0
      shading += ((macro - 0.5) * 8) | 0
    }
  }
  const varAmt = varAmountForTile(tid)
  const bx = col * TILE
  const by = row * TILE
  for (let ty = 0; ty < TILE; ty++) {
    const gy = by + ty
    let pi = (gy * W + bx) * 4
    for (let tx = 0; tx < TILE; tx++, pi += 4) {
      const gx = bx + tx
      const clusterX = gx >> 1
      const clusterY = gy >> 1
      let h = (clusterX * 374761393 + clusterY * 668265263) | 0
      h = Math.imul(h ^ (h >>> 13), 1274126177) | 0
      const dither = ((gx ^ gy) & 1) === 0 ? -1 : 1
      const k = (((((h >>> 0) & 0xff) - 128) * varAmt) >> 7) + dither + refTerrainDetail(tid, gx, gy)
      let rr = r + k + shading
      let gg = g + k + shading
      let bb = b + k + shading
      if (rr < 0) rr = 0
      else if (rr > 255) rr = 255
      if (gg < 0) gg = 0
      else if (gg > 255) gg = 255
      if (bb < 0) bb = 0
      else if (bb > 255) bb = 255
      d[pi] = rr
      d[pi + 1] = gg
      d[pi + 2] = bb
      d[pi + 3] = 255
    }
  }
}

function refMountainHeights(tiles: number[][], width: number, height: number): Uint8Array {
  const MAX_HEIGHT = 6
  const isHighAt = (x: number, y: number) => {
    const t = tiles[y]?.[x]
    if (t === TILE_ID.ROCK) return true
    if (t !== TILE_ID.SNOW) return false
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) if (tiles[y + dy]?.[x + dx] === TILE_ID.ROCK) return true
    return false
  }
  const h = new Uint8Array(width * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) if (isHighAt(x, y)) h[y * width + x] = MAX_HEIGHT
  for (let pass = 0; pass < MAX_HEIGHT; pass++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x
        if (h[i] === 0) continue
        let low = MAX_HEIGHT
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          const nx = x + dx
          const ny = y + dy
          const n = nx < 0 || ny < 0 || nx >= width || ny >= height ? 0 : h[ny * width + nx]
          if (n < low) low = n
        }
        if (low + 1 < h[i]) h[i] = low + 1
      }
    }
  }
  return h
}

function refTreeOrder(n: number): number[] {
  const order: number[] = []
  for (let i = 0; i < n; i++) order.push(i)
  for (let i = order.length - 1; i > 0; i--) {
    const r = (i * 2654435761) >>> 0
    const j = r % (i + 1)
    const tmp = order[i]
    order[i] = order[j]
    order[j] = tmp
  }
  return order
}

function makeWorld(seed: number, width: number, height: number) {
  const rand = rng(seed)
  const kinds = [
    TILE_ID.WATER,
    TILE_ID.WATER,
    TILE_ID.WATER,
    TILE_ID.GRASS,
    TILE_ID.GRASS,
    TILE_ID.FLOODED,
    TILE_ID.FOOD,
    TILE_ID.HUT,
    TILE_ID.FIRE,
    TILE_ID.CAMPFIRE,
    TILE_ID.MINERAL,
    TILE_ID.ROCK,
    TILE_ID.ROCK,
    TILE_ID.SNOW,
    TILE_ID.SAND,
    TILE_ID.ASH,
    TILE_ID.SCORCHED,
    TILE_ID.VOID,
  ]
  const tiles: number[][] = []
  const biomes: number[][] = []
  const depth: number[][] = []
  for (let r = 0; r < height; r++) {
    const tr: number[] = []
    const br: number[] = []
    const dr: number[] = []
    for (let c = 0; c < width; c++) {
      tr.push(kinds[Math.floor(rand() * kinds.length)])
      br.push(Math.floor(rand() * 10))
      const roll = rand()
      dr.push(roll < 0.1 ? 300 : roll < 0.2 ? -5 : Math.floor(rand() * 254))
    }
    tiles.push(tr)
    biomes.push(br)
    depth.push(dr)
  }
  return { tiles, biomes, depth }
}

describe('terrain base layer build', () => {
  it('paints byte-identical pixels to the previous per-pixel implementation', () => {
    const width = 70
    const height = 50
    const W = width * TILE
    for (const [seed, season] of [
      [1, 'recovery'],
      [2, 'scarcity'],
      [3, 'hard_winter'],
      [4, undefined],
      [5, 'decline'],
    ] as const) {
      const { tiles, biomes, depth } = makeWorld(seed, width, height)
      const a = new Uint8ClampedArray(W * height * TILE * 4)
      const b = new Uint8ClampedArray(W * height * TILE * 4)
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          refPaintTileBlock(a, W, tiles, biomes, depth, season, row, col)
          paintTileBlock(b, W, tiles, biomes, depth, season, row, col)
        }
      }
      expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0)
      // Without biome or depth data, and with a repaint order that is not row-major.
      const c = new Uint8ClampedArray(a.length)
      const d = new Uint8ClampedArray(a.length)
      for (let col = width - 1; col >= 0; col--) {
        for (let row = height - 1; row >= 0; row--) {
          refPaintTileBlock(c, W, tiles, undefined, undefined, season, row, col)
          paintTileBlock(d, W, tiles, undefined, undefined, season, row, col)
        }
      }
      expect(Buffer.compare(Buffer.from(c), Buffer.from(d))).toBe(0)
    }
  })

  it('terrainDetail, oceanColor, mountain heights and tree order are unchanged', () => {
    for (const tile of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
      for (let x = -12; x < 40; x++) {
        for (let y = -10; y < 30; y++) expect(terrainDetail(tile, x, y)).toBe(refTerrainDetail(tile, x, y))
      }
    }
    for (const depth of [0, 1, 50, 129.5, 130, 131, 180, 199, 200, 220, 253, 300, -5]) {
      expect(oceanColor(depth)).toEqual(refOceanColor(depth))
      expect(oceanColor(depth)).toEqual(refOceanColor(depth))
    }
    const { tiles } = makeWorld(11, 60, 45)
    expect([...mountainHeights(tiles, 60, 45)]).toEqual([...refMountainHeights(tiles, 60, 45)])
    for (const n of [1, 2, 17, 1000, 600 * 300]) {
      expect([...treePlacementOrder(n)]).toEqual(refTreeOrder(n))
      expect([...treePlacementOrder(n)]).toEqual(refTreeOrder(n))
    }
  })
})
