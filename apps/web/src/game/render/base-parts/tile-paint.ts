import { terrainDetail } from '../terrain-detail'
import { TILE_ID, isPermanentWaterTile, isWaterTile } from '../../model/terrain-ids'
import { baseTerrainTile, permanentWaterDepth } from '../../model/terrain-visuals'
import { oceanColor } from '../landscape-style'
import { TILE, TILE_RGB, BIOME_RGBA, SEASON_LAND_TINT } from '../../model/palette'
import { macroNoise, macroNoiseFine } from './noise'

export function varAmountForTile(tid: number): number {
  if (tid === 2 || tid === 9) return 2
  if (tid === 1 || tid === 3) return 2
  if (tid === 5) return 3
  if (tid === 6) return 9
  if (tid === 12) return 3
  if (tid === 13) return 2
  return 4
}

const clusterNoiseScratch = new Int32Array(TILE / 2)

function packClamped(r: number, g: number, b: number): number {
  const rr = r < 0 ? 0 : r > 255 ? 255 : r
  const gg = g < 0 ? 0 : g > 255 ? 255 : g
  const bb = b < 0 ? 0 : b > 255 ? 255 : b
  return 0xff000000 | (bb << 16) | (gg << 8) | rr
}

// RGBA pixels are written as one 32-bit word instead of four byte stores. Only valid on
// little-endian hosts (every browser target), where the word is 0xAABBGGRR.
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1
const pixelWordViews = new WeakMap<Uint8ClampedArray<ArrayBufferLike>, Uint32Array>()
function pixelWords(d: Uint8ClampedArray<ArrayBufferLike>): Uint32Array | null {
  if (!LITTLE_ENDIAN || d.byteOffset % 4 !== 0 || d.length % 4 !== 0) return null
  let view = pixelWordViews.get(d)
  if (!view) {
    view = new Uint32Array(d.buffer, d.byteOffset, d.length >> 2)
    pixelWordViews.set(d, view)
  }
  return view
}

const colorScratch = new Int32Array(4)

/**
 * One tile's flat colour before the per-pixel texture: the tile id's colour, ocean depth, the
 * shallow-edge mix, the biome blend, macro noise shading and the season's land tint. Writes
 * `[r, g, b, shading]` into `out` (r, g, b are unclamped integers; `shading` is added to every
 * channel of every pixel) and returns the base terrain id the texture is chosen by. Shared by the
 * canvas painter and the TileLayer terrain, so both colour the ground identically.
 */
export function tileColor(
  out: Int32Array,
  tiles: number[][],
  biomes: number[][] | undefined,
  depth_map: number[][] | undefined,
  season: string | undefined,
  row: number,
  col: number,
): number {
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
    const ocean = oceanColor(visualDepth)
    r = ocean[0]
    g = ocean[1]
    b = ocean[2]
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

  const macro =
    macroNoise.at(col / 42, row / 42) * 0.65 + macroNoiseFine.at(col / 13 + 7, row / 13 + 7) * 0.35
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
  out[0] = r
  out[1] = g
  out[2] = b
  out[3] = shading
  return tid
}

// Paint one tile's TILE x TILE pixel block into the base ImageData.
// Extracted from the full-grid rebuild loop so incremental updates can
// repaint individual tiles with byte-identical results.
export function paintTileBlock(
  d: Uint8ClampedArray<ArrayBufferLike>,
  W: number,
  tiles: number[][],
  biomes: number[][] | undefined,
  depth_map: number[][] | undefined,
  season: string | undefined,
  row: number,
  col: number,
) {
  const tid = tileColor(colorScratch, tiles, biomes, depth_map, season, row, col)
  const r = colorScratch[0]
  const g = colorScratch[1]
  const b = colorScratch[2]
  const shading = colorScratch[3]
  const varAmt = varAmountForTile(tid)
  const bx = col * TILE
  const by = row * TILE
  // The texture noise is constant over each 2x2 pixel cluster, so it is hashed once per
  // cluster (a tile block is TILE/2 clusters wide) instead of once per pixel.
  const clusterNoise = clusterNoiseScratch
  const words = pixelWords(d)
  // Only these tiles carry surface marks; for the rest (mostly water) skip the per-pixel call.
  const hasDetail =
    tid === TILE_ID.SAND ||
    tid === TILE_ID.ROCK ||
    tid === TILE_ID.SNOW ||
    tid === TILE_ID.GRASS ||
    tid === TILE_ID.FOOD
  if (words && !hasDetail) {
    // No surface marks: a 2x2 cluster has one noise value and a diagonal dither, so it is
    // two colours, (noise - 1) on the main diagonal and (noise + 1) on the other. TILE is even
    // and tiles start on even pixels, so cluster and pixel parity line up with the tile origin.
    for (let cy = 0; cy < TILE / 2; cy++) {
      const clusterY = (by >> 1) + cy
      let at = (by + cy * 2) * W + bx
      for (let cx = 0; cx < TILE / 2; cx++, at += 2) {
        const clusterX = (bx >> 1) + cx
        let h = (clusterX * 374761393 + clusterY * 668265263) | 0
        h = Math.imul(h ^ (h >>> 13), 1274126177) | 0
        const noise = ((((h >>> 0) & 0xff) - 128) * varAmt) >> 7
        const dark = packClamped(r + noise - 1 + shading, g + noise - 1 + shading, b + noise - 1 + shading)
        const light = packClamped(r + noise + 1 + shading, g + noise + 1 + shading, b + noise + 1 + shading)
        words[at] = dark
        words[at + 1] = light
        words[at + W] = light
        words[at + W + 1] = dark
      }
    }
    return
  }
  for (let ty = 0; ty < TILE; ty++) {
    const gy = by + ty
    if ((ty & 1) === 0) {
      const clusterY = gy >> 1
      for (let cx = 0; cx < TILE / 2; cx++) {
        const clusterX = (bx >> 1) + cx
        let h = (clusterX * 374761393 + clusterY * 668265263) | 0
        h = Math.imul(h ^ (h >>> 13), 1274126177) | 0
        clusterNoise[cx] = ((((h >>> 0) & 0xff) - 128) * varAmt) >> 7
      }
    }
    let pi = (gy * W + bx) * 4
    for (let tx = 0; tx < TILE; tx++, pi += 4) {
      const gx = bx + tx
      // Texture in small pixel-art clusters instead of independent
      // per-pixel static. The macro field shapes broad biome patches;
      // this 2x2 dither keeps nearby terrain readable at game scale.
      const dither = ((gx ^ gy) & 1) === 0 ? -1 : 1
      const k = clusterNoise[tx >> 1] + dither + (hasDetail ? terrainDetail(tid, gx, gy) : 0)
      let rr = r + k + shading
      let gg = g + k + shading
      let bb = b + k + shading
      if (rr < 0) rr = 0
      else if (rr > 255) rr = 255
      if (gg < 0) gg = 0
      else if (gg > 255) gg = 255
      if (bb < 0) bb = 0
      else if (bb > 255) bb = 255
      if (words) {
        words[pi >> 2] = 0xff000000 | (bb << 16) | (gg << 8) | rr
      } else {
        d[pi] = rr
        d[pi + 1] = gg
        d[pi + 2] = bb
        d[pi + 3] = 255
      }
    }
  }
}

export const SHALLOW_RGB: [number, number, number] = [116, 198, 208]
