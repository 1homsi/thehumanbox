import { shorelineColors, vegetationSeason, landscapeHash } from './landscape-style'
/**
 * Cosmetic / atmospheric decorations rendered onto the 2D world
 * canvas: trees (drawn into the cached base layer), clouds, and
 * shared scratch buffers. Extracted from WorldView.tsx so the
 * orchestrator file can stay focused on the per-frame pipeline.
 */

import { drawVegetationSprite } from './vegetation-sprites'
import { isHighAt } from './mountains'
import { SPRITE, ATLAS_TOWN, drawTile } from '../../shared/sprites'
import type { WorldState } from '../../shared/types'
import { TILE } from '../model/palette'
import { BIOME_ID, TILE_ID, isWaterTile } from '../model/terrain-ids'
import {
  EDGE_EAST,
  EDGE_NORTH,
  EDGE_SOUTH,
  EDGE_WEST,
  permanentWaterLandEdgeMask,
  permanentWaterNeighborMask,
} from '../model/terrain-visuals'

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
    const radius = Math.max(3, Math.round(pr))
    const x = Math.round(px)
    const y = Math.round(py)
    ctx.fillStyle = `rgba(${color},${pa * 0.25})`
    ctx.fillRect(x - radius, y - Math.round(radius * 0.24), radius * 2, Math.max(2, radius))
    ctx.fillStyle = `rgba(${color},${pa * 0.58})`
    ctx.fillRect(
      x - Math.round(radius * 0.72),
      y - Math.round(radius * 0.52),
      Math.round(radius * 1.44),
      Math.max(2, Math.round(radius * 0.84)),
    )
    ctx.fillStyle = `rgba(${color},${pa})`
    ctx.fillRect(
      x - Math.round(radius * 0.42),
      y - Math.round(radius * 0.68),
      Math.max(2, Math.round(radius * 0.84)),
      Math.max(2, Math.round(radius * 0.5)),
    )
  }

  ctx.fillStyle = `rgba(${color},${alpha * 0.42})`
  ctx.fillRect(
    Math.round(cx - cloudW * 0.72),
    Math.round(cy - cloudH * 0.08),
    Math.round(cloudW * 1.44),
    Math.max(3, Math.round(cloudH * 0.55)),
  )

  const nPuffs = 6 + Math.floor(rand() * 4)
  for (let p = 0; p < nPuffs; p++) {
    const t = p / (nPuffs - 1)
    const edgeBias = 1 - Math.abs(t - 0.5) * 1.6
    const px = cx + (t - 0.5) * cloudW * 1.55 + (rand() - 0.5) * cloudW * 0.25
    const py = cy - cloudH * (0.05 + rand() * 0.5 * edgeBias)
    const pr = cloudH * (0.45 + rand() * 0.55 * edgeBias)
    drawPuff(px, py, pr, alpha * (0.55 + rand() * 0.45))
  }
}

export interface DecorRegion {
  /** Inclusive tile bounds; sprites anchored outside are not painted. */
  x0: number
  y0: number
  x1: number
  y1: number
}

type PlacedTree = { cx: number; cy: number; sz: number; sprite: typeof SPRITE.trees.oak_mid }

/** Trees painted into the cached base layer, kept so the frame can sway them. */
let swayTrees: PlacedTree[] = []

/**
 * Trees are baked into the static base layer, so each frame redraws just the
 * canopy of the visible ones a pixel or two to the side. Over the identical
 * baked canopy that reads as leaves moving in the wind rather than a second
 * tree. Stronger in storms; skipped when zoomed out, where it is invisible.
 */
export function drawTreeSway(
  ctx: CanvasRenderingContext2D,
  now: number,
  view: { x0: number; y0: number; x1: number; y1: number },
  wind: { storm: boolean; windX: number },
) {
  if (!ATLAS_TOWN.complete || swayTrees.length === 0) return
  const amp = wind.storm ? 2.4 : 1.2
  const lean = Math.max(-1, Math.min(1, wind.windX)) * (wind.storm ? 1 : 0.4)
  for (const tree of swayTrees) {
    const { cx, cy, sz, sprite } = tree
    if (cx + sz < view.x0 || cx > view.x1 || cy + sz < view.y0 || cy > view.y1) continue
    if (sprite === SPRITE.trees.cactus || sprite === SPRITE.trees.dead) continue
    const phase = cx * 0.13 + cy * 0.071
    const gust = 0.6 + 0.4 * Math.sin(now / 2300 + cx * 0.01)
    const sway = Math.round((Math.sin(now / 620 + phase) * amp + lean) * gust)
    if (sway === 0) continue
    const canopy = sz * 0.62
    ctx.save()
    ctx.beginPath()
    ctx.rect(cx - 3, cy, sz + 6, canopy)
    ctx.clip()
    if (!drawVegetationSprite(ctx, sprite, cx + sway, cy, sz)) {
      drawTile(ctx, ATLAS_TOWN, sprite, Math.round(cx + sway), Math.round(cy), Math.round(sz))
    }
    ctx.restore()
  }
}

export function drawTrees(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tiles: number[][],
  biomes?: number[][],
  originX = 0,
  originY = 0,
  only?: DecorRegion,
  season = 'summer',
) {
  if (!biomes || !ATLAS_TOWN.complete) return
  season = vegetationSeason(season)
  const TREE_SIZE = 25
  const trees: PlacedTree[] = []
  const acacias: { x: number; y: number; s: number }[] = []

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
    const biome = bRow[x] ?? 0
    const supportsTree =
      biome === BIOME_ID.DESERT
        ? t === TILE_ID.SAND || t === TILE_ID.GRASS
        : biome === BIOME_ID.TUNDRA
          ? t === TILE_ID.SNOW || t === TILE_ID.GRASS || t === TILE_ID.FOOD
          : biome === BIOME_ID.VOLCANIC
            ? t === TILE_ID.ASH || t === TILE_ID.SCORCHED || t === TILE_ID.GRASS
            : biome === BIOME_ID.SAVANNA || biome === BIOME_ID.BADLANDS
              ? t === TILE_ID.GRASS || t === TILE_ID.FOOD || t === TILE_ID.SAND
              : biome === BIOME_ID.TAIGA
                ? t === TILE_ID.GRASS || t === TILE_ID.FOOD || t === TILE_ID.SNOW
                : t === TILE_ID.GRASS || t === TILE_ID.FOOD
    if (!supportsTree) continue
    // Mountains own their ground: no trees on a range or at its foot,
    // where the canopy would poke out from behind the rock.
    let nearRange = false
    for (let dy = -1; dy <= 1 && !nearRange; dy++)
      for (let dx = -1; dx <= 1; dx++) if (isHighAt(tiles, x + dx, y + dy)) nearRange = true
    if (nearRange) continue

    const worldX = x + originX
    const worldY = y + originY
    const hash = landscapeHash(worldX, worldY)
    const r0 = (hash & 0xff) / 255
    const r1 = ((hash >>> 8) & 0xff) / 255

    let chance = 0
    let spacing = 2
    switch (biome) {
      case BIOME_ID.FOREST:
        chance = 0.42
        spacing = 2
        break
      case BIOME_ID.WETLAND:
        chance = 0.18
        spacing = 3
        break
      case BIOME_ID.GRASSLAND:
        chance = 0.06
        spacing = 5
        break
      case BIOME_ID.TUNDRA:
        chance = 0.1
        spacing = 4
        break
      case BIOME_ID.DESERT:
        chance = 0.03
        spacing = 6
        break
      case BIOME_ID.VOLCANIC:
        chance = 0.05
        spacing = 4
        break
      case BIOME_ID.JUNGLE:
        // A closed canopy: trees almost shoulder to shoulder.
        chance = 0.62
        spacing = 1
        break
      case BIOME_ID.SAVANNA:
        chance = 0.05
        spacing = 6
        break
      case BIOME_ID.TAIGA:
        // Close ranks of dark pines.
        chance = 0.45
        spacing = 2
        break
      case BIOME_ID.BADLANDS:
        chance = 0.025
        spacing = 7
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

    // Region-filtered repaints still run the global placement pass
    // (tree existence depends on every higher-priority neighbour) but
    // only paint sprites anchored inside the region.
    if (only && (x < only.x0 - 3 || x > only.x1 + 3 || y < only.y0 - 3 || y > only.y1 + 3)) {
      continue
    }

    const sz = TREE_SIZE * (0.85 + ((r1 * 17) % 1) * 0.4)
    const cx = x * TILE + (TILE - sz) / 2 + (r1 - 0.5) * TILE * 0.5
    const cy = y * TILE + (TILE - sz) / 2 + (((r0 * 7) % 1) - 0.5) * TILE * 0.5

    let sprite = SPRITE.trees.oak_mid
    switch (biome) {
      case BIOME_ID.FOREST:
        sprite = r1 < 0.45 ? SPRITE.trees.conifer : r1 < 0.75 ? SPRITE.trees.oak_dark : SPRITE.trees.oak_mid
        break
      case BIOME_ID.WETLAND:
        sprite = r1 < 0.6 ? SPRITE.trees.bush : SPRITE.trees.oak_mid
        break
      case BIOME_ID.GRASSLAND:
        sprite = r1 < 0.6 ? SPRITE.trees.oak_light : SPRITE.trees.oak_mid
        break
      case BIOME_ID.TUNDRA:
        sprite = SPRITE.trees.conifer_dk
        break
      case BIOME_ID.DESERT:
        sprite = r1 < 0.5 ? SPRITE.trees.cactus : SPRITE.trees.dead
        break
      case BIOME_ID.VOLCANIC:
        sprite = SPRITE.trees.dead
        break
      case BIOME_ID.JUNGLE:
        sprite = r1 < 0.62 ? SPRITE.trees.oak_dark : SPRITE.trees.bush
        break
      case BIOME_ID.TAIGA:
        sprite = r1 < 0.7 ? SPRITE.trees.conifer_dk : SPRITE.trees.conifer
        break
      case BIOME_ID.BADLANDS:
        sprite = r1 < 0.5 ? SPRITE.trees.dead : SPRITE.trees.cactus
        break
      case BIOME_ID.SAVANNA:
        // Flat-topped acacias are drawn by hand; the atlas has none.
        if (r1 < 0.75) {
          acacias.push({
            x: x * TILE + TILE / 2 + (r1 - 0.5) * TILE * 0.5,
            y: y * TILE + TILE,
            s: 0.9 + r0 * 4,
          })
          continue
        }
        sprite = SPRITE.trees.dead
        break
    }
    const deciduous =
      biome === BIOME_ID.GRASSLAND || biome === BIOME_ID.WETLAND || (biome === BIOME_ID.FOREST && r1 >= 0.45)
    if (deciduous && season === 'autumn') {
      sprite = r1 < 0.6 ? SPRITE.trees.autumn_yel : SPRITE.trees.autumn_red
    } else if (deciduous && season === 'winter') {
      sprite = SPRITE.trees.dead
    }
    trees.push({ cx, cy, sz, sprite })
  }
  // Place deterministically, then paint back-to-front so tree crowns overlap naturally.
  trees.sort((a, b) => a.cy + a.sz - (b.cy + b.sz))
  if (only) {
    // A region repaint only re-places trees inside it; keep the rest.
    const inRegion = (t: PlacedTree) =>
      t.cx >= (only.x0 - 3) * TILE &&
      t.cx <= (only.x1 + 4) * TILE &&
      t.cy >= (only.y0 - 3) * TILE &&
      t.cy <= (only.y1 + 4) * TILE
    swayTrees = swayTrees
      .filter((t) => !inRegion(t))
      .concat(trees)
      .sort((a, b) => a.cy + a.sz - (b.cy + b.sz))
  } else {
    swayTrees = trees
  }
  for (const { cx, cy, sz } of trees) {
    const shadowWidth = Math.max(4, Math.round(sz * 0.48))
    ctx.fillStyle = 'rgba(20,24,18,0.24)'
    ctx.fillRect(
      Math.round(cx + (sz - shadowWidth) / 2),
      Math.round(cy + sz * 0.88),
      shadowWidth,
      Math.max(1, Math.round(sz * 0.1)),
    )
  }
  for (const { cx, cy, sz, sprite } of trees) {
    if (!drawVegetationSprite(ctx, sprite, cx, cy, sz)) {
      drawTile(ctx, ATLAS_TOWN, sprite, Math.round(cx), Math.round(cy), Math.round(sz))
    }
  }
  acacias.sort((a, b) => a.y - b.y)
  for (const a of acacias) drawAcacia(ctx, a.x, a.y, a.s)
}

/** A savanna acacia: thin forked trunk under a wide, flat canopy. */
function drawAcacia(ctx: CanvasRenderingContext2D, x: number, baseY: number, scale: number) {
  const cx = Math.round(x)
  const by = Math.round(baseY)
  const trunk = Math.round(9 * Math.min(1.3, scale))
  const half = Math.round(8 * Math.min(1.3, scale))
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.fillRect(cx - half + 2, by - 1, half * 2 - 2, 2)
  ctx.fillStyle = '#5a3b22'
  ctx.fillRect(cx, by - trunk, 1, trunk)
  ctx.fillRect(cx - 2, by - trunk, 2, 1)
  ctx.fillRect(cx + 1, by - trunk - 1, 2, 1)
  const top = by - trunk - 4
  ctx.fillStyle = '#3f4f22'
  ctx.fillRect(cx - half, top + 2, half * 2, 2)
  ctx.fillStyle = '#6e7d34'
  ctx.fillRect(cx - half + 1, top + 1, half * 2 - 2, 2)
  ctx.fillStyle = '#93a14a'
  ctx.fillRect(cx - half + 3, top, half * 2 - 7, 1)
}

export function drawNaturalDecor(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tiles: number[][],
  biomes?: number[][],
  originX = 0,
  originY = 0,
  only?: DecorRegion,
) {
  if (!biomes) return
  ctx.save()
  for (let y = 1; y < height - 1; y++) {
    if (only && (y < only.y0 - 1 || y > only.y1 + 1)) continue
    const tRow = tiles[y]
    const bRow = biomes[y]
    if (!tRow || !bRow) continue
    for (let x = 1; x < width - 1; x++) {
      if (only && (x < only.x0 - 1 || x > only.x1 + 1)) continue
      const t = tRow[x]
      const biome = bRow[x] ?? 0
      const worldX = x + originX
      const worldY = y + originY
      const hash = landscapeHash(worldX, worldY)
      const r0 = (hash & 0xff) / 255
      const r1 = ((hash >>> 8) & 0xff) / 255
      const r2 = ((hash >>> 16) & 0xff) / 255
      const px = x * TILE
      const py = y * TILE

      if (
        (t === TILE_ID.ROCK && r0 < 0.25) ||
        (t === TILE_ID.SAND && biome === BIOME_ID.DESERT && r0 < 0.04)
      ) {
        const sz = 2 + Math.floor(r1 * 2)
        const rockX = Math.round(px + TILE / 2 + (r2 - 0.5) * TILE * 0.4 - sz / 2)
        const rockY = Math.round(py + TILE / 2 + (r0 - 0.5) * TILE * 0.4)
        ctx.fillStyle = t === TILE_ID.ROCK ? '#443f3b' : '#705f45'
        ctx.fillRect(rockX, rockY, sz + 1, 2)
        ctx.fillStyle = t === TILE_ID.ROCK ? '#77706a' : '#a58a5e'
        ctx.fillRect(rockX + 1, rockY - 1, Math.max(1, sz - 1), 1)
        continue
      }
      if (t === TILE_ID.SNOW && r0 < 0.18) {
        const snowX = Math.round(px + TILE / 2 + (r2 - 0.5) * TILE * 0.3)
        const snowY = Math.round(py + TILE / 2 + (r1 - 0.5) * TILE * 0.3)
        ctx.fillStyle = 'rgba(245,250,255,0.7)'
        ctx.fillRect(snowX - 2, snowY, 4, 1)
        ctx.fillRect(snowX - 1, snowY - 1, 3, 1)
        continue
      }
      if (biome === BIOME_ID.BADLANDS && t === TILE_ID.SAND && r0 < 0.07) {
        // A wind-cut red rock pillar with a lit face and a flat cap.
        const bx = Math.round(px + TILE / 2 + (r1 - 0.5) * TILE * 0.4)
        const by = Math.round(py + TILE - 1)
        const hgt = 4 + Math.floor(r2 * 5)
        ctx.fillStyle = 'rgba(40,16,8,0.3)'
        ctx.fillRect(bx - 2, by, 6, 1)
        ctx.fillStyle = '#8a3f22'
        ctx.fillRect(bx - 2, by - hgt, 4, hgt)
        ctx.fillStyle = '#c26a3e'
        ctx.fillRect(bx - 2, by - hgt, 2, hgt)
        ctx.fillStyle = '#e09160'
        ctx.fillRect(bx - 3, by - hgt - 1, 6, 1)
        continue
      }
      if (t !== TILE_ID.GRASS && t !== TILE_ID.FOOD) continue

      if (biome === BIOME_ID.SAVANNA && r0 < 0.2) {
        // Tall dry grass in tufts.
        const gx = Math.round(px + TILE / 2 + (r1 - 0.5) * TILE * 0.5)
        const gy = Math.round(py + TILE / 2 + (r2 - 0.5) * TILE * 0.4)
        ctx.fillStyle = '#b9a45a'
        ctx.fillRect(gx - 2, gy - 2, 1, 3)
        ctx.fillRect(gx, gy - 3, 1, 4)
        ctx.fillRect(gx + 2, gy - 2, 1, 3)
        ctx.fillStyle = '#e1cd7c'
        ctx.fillRect(gx, gy - 3, 1, 1)
        continue
      }
      if (biome === BIOME_ID.JUNGLE && r0 < 0.14) {
        // Ferns in the undergrowth.
        const fx = Math.round(px + TILE / 2 + (r1 - 0.5) * TILE * 0.5)
        const fy = Math.round(py + TILE / 2 + (r2 - 0.5) * TILE * 0.4)
        ctx.fillStyle = '#1f5a28'
        ctx.fillRect(fx - 2, fy, 5, 1)
        ctx.fillRect(fx - 1, fy - 1, 3, 1)
        ctx.fillStyle = '#3f8a3a'
        ctx.fillRect(fx, fy - 2, 1, 2)
        continue
      }

      if (
        biome === BIOME_ID.GRASSLAND &&
        r0 < (Math.sin(worldX * 0.13) + Math.sin(worldY * 0.17) > 1 ? 0.22 : 0.018)
      ) {
        const colors = ['#f1b9bf', '#f6e3a0', '#cfc0e9', '#f5eade']
        ctx.fillStyle = colors[Math.floor(r2 * colors.length)]
        const fx = px + TILE / 2 + (r1 - 0.5) * TILE * 0.4
        const fy = py + TILE / 2 + (r2 - 0.5) * TILE * 0.4
        ctx.fillRect(Math.round(fx) - 1, Math.round(fy), 3, 1)
        ctx.fillRect(Math.round(fx), Math.round(fy) - 1, 1, 3)
        ctx.fillStyle = '#e4bc68'
        ctx.fillRect(Math.round(fx), Math.round(fy), 1, 1)
        ctx.fillStyle = '#3a6b32'
        ctx.fillRect(fx, fy + 1, 1, 2)
      } else if (biome === BIOME_ID.FOREST && r0 < 0.06) {
        const mx = px + TILE / 2 + (r2 - 0.5) * TILE * 0.4
        const my = py + TILE / 2 + (r1 - 0.5) * TILE * 0.4
        ctx.fillStyle = r1 < 0.5 ? '#c54a4a' : '#ddd5b8'
        ctx.beginPath()
        ctx.arc(mx, my, 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#f0e8d8'
        ctx.fillRect(mx - 1, my + 1, 2, 2)
      } else if ((biome === BIOME_ID.GRASSLAND || biome === BIOME_ID.WETLAND) && r1 < 0.12) {
        ctx.strokeStyle = biome === BIOME_ID.WETLAND ? '#5a8848' : '#7ea860'
        ctx.lineWidth = 1
        const gx = px + TILE / 2 + (r0 - 0.5) * TILE * 0.5
        const gy = py + TILE - 1
        ctx.beginPath()
        ctx.moveTo(gx, gy)
        ctx.lineTo(gx + (r2 - 0.5) * 2, gy - 3)
        ctx.moveTo(gx + 1, gy)
        ctx.lineTo(gx + 1 + (r2 - 0.5) * 2, gy - 2)
        ctx.stroke()
      } else if (biome === BIOME_ID.TUNDRA && r0 < 0.08) {
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

  // Crisp land/water transitions. Permanent water creates beaches and
  // shallow rims; temporary floodwater remains a separate muddy overlay.
  for (let y = 0; y < height; y++) {
    const tRow = tiles[y]
    if (!tRow) continue
    for (let x = 0; x < width; x++) {
      const t = tRow[x]
      const px = x * TILE
      const py = y * TILE
      if (!isWaterTile(t)) {
        const beach = permanentWaterNeighborMask(tiles, y, x)
        if (beach !== 0) {
          const [bank, rim] = shorelineColors(t, biomes?.[y]?.[x] ?? 0)
          ctx.fillStyle = bank
          if (beach & EDGE_NORTH) ctx.fillRect(px, py, TILE, 2)
          if (beach & EDGE_SOUTH) ctx.fillRect(px, py + TILE - 2, TILE, 2)
          if (beach & EDGE_WEST) ctx.fillRect(px, py, 2, TILE)
          if (beach & EDGE_EAST) ctx.fillRect(px + TILE - 2, py, 2, TILE)
          ctx.fillStyle = 'rgba(53,66,48,0.48)'
          if (beach & EDGE_SOUTH) ctx.fillRect(px, py + TILE - 2, TILE, 2)
          if (beach & EDGE_EAST) ctx.fillRect(px + TILE - 2, py, 2, TILE)
          ctx.fillStyle = rim
          if (beach & EDGE_NORTH) ctx.fillRect(px + 1, py, TILE - 2, 1)
          if (beach & EDGE_SOUTH) ctx.fillRect(px + 1, py + TILE - 1, TILE - 2, 1)
          if (beach & EDGE_WEST) ctx.fillRect(px, py + 1, 1, TILE - 2)
          if (beach & EDGE_EAST) ctx.fillRect(px + TILE - 1, py + 1, 1, TILE - 2)
        }
      } else if (t === TILE_ID.WATER) {
        const shore = permanentWaterLandEdgeMask(tiles, y, x)
        if (shore !== 0) {
          ctx.fillStyle = 'rgba(145,220,222,0.42)'
          if (shore & EDGE_NORTH) ctx.fillRect(px, py, TILE, 1)
          if (shore & EDGE_SOUTH) ctx.fillRect(px, py + TILE - 1, TILE, 1)
          if (shore & EDGE_WEST) ctx.fillRect(px, py, 1, TILE)
          if (shore & EDGE_EAST) ctx.fillRect(px + TILE - 1, py, 1, TILE)
        }
      } else {
        const worldX = x + originX
        const worldY = y + originY
        const hash = landscapeHash(worldX, worldY)
        ctx.fillStyle = 'rgba(175,214,206,0.24)'
        ctx.fillRect(px + 1 + ((hash >>> 8) & 1), py + 2, 4, 1)
        ctx.fillStyle = 'rgba(74,101,91,0.3)'
        ctx.fillRect(px + 3, py + 5, 3, 1)
      }
    }
  }

  for (let y = 1; y < height - 1; y++) {
    const tRow = tiles[y]
    if (!tRow) continue
    for (let x = 1; x < width - 1; x++) {
      if (tRow[x] !== TILE_ID.WATER) continue
      const above = tiles[y - 1]?.[x]
      const below = tiles[y + 1]?.[x]
      const left = tRow[x - 1]
      const right = tRow[x + 1]
      const landGrass = (n: number | undefined) => n === TILE_ID.GRASS || n === TILE_ID.FOOD
      const grassEdges = [
        landGrass(above) ? EDGE_NORTH : 0,
        landGrass(below) ? EDGE_SOUTH : 0,
        landGrass(left) ? EDGE_WEST : 0,
        landGrass(right) ? EDGE_EAST : 0,
      ].filter(Boolean)
      if (grassEdges.length === 0) continue
      const worldX = x + originX
      const worldY = y + originY
      const hash = landscapeHash(worldX, worldY)
      if ((hash & 0xff) > 110) continue
      const r1 = ((hash >>> 8) & 0xff) / 255
      const r2 = ((hash >>> 16) & 0xff) / 255
      ctx.strokeStyle = '#3e6b3a'
      ctx.lineWidth = 1
      const edge = grassEdges[hash % grassEdges.length]
      let px = x * TILE + 2 + Math.round(r2 * Math.max(1, TILE - 4))
      let py = y * TILE + TILE - 1
      if (edge === EDGE_NORTH) py = y * TILE + 2
      else if (edge === EDGE_WEST) {
        px = x * TILE + 1
        py = y * TILE + 3 + Math.round(r2 * Math.max(1, TILE - 6))
      } else if (edge === EDGE_EAST) {
        px = x * TILE + TILE - 1
        py = y * TILE + 3 + Math.round(r2 * Math.max(1, TILE - 6))
      }
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px + Math.round((r1 - 0.5) * 2), py - 4)
      ctx.moveTo(px + 1, py)
      ctx.lineTo(px + 1 + Math.round((r1 - 0.5) * 2), py - 3)
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
