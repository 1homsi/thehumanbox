import {
  _baseKey,
  cachedHutClusters,
  getTileDecorLayer,
  getWaterFxLayers,
  hutTileList,
} from '.././base-layer'
import { drawFoodPatch, drawMineralOutcrop, drawPixelFire, visualTileHash } from '.././draw-helpers'

import { getBuildingSprite, PAD as SPRITE_PAD, PAD_BOT as SPRITE_PAD_BOT } from '.././building-sprites'

import { TILE_ID } from '../../model/terrain-ids'

import { LOW_PERF } from '../../../shared/perf'

import { TILE } from '../../model/palette'

import { firstCellAtRow, specialTileIndex } from '.././special-tiles'
import { emitShimmerRects, emitWaveletRects, waterCellIndex } from '.././water-fx'
import { cfOwns } from '../cf/ownership'
import type { DrawFrame } from './frame'

// Structure strength arrives as whole percents, so a frame draws thousands of tiles
// from at most ~100 distinct strengths. Each style string is built (and parsed by the
// canvas) once per strength instead of once per tile per frame.
const STRUCTURE_STYLES: Array<(s: number) => string> = [
  (s) => `rgba(120,90,60,${0.6 + s * 0.3})`,
  (s) => `rgba(90,70,50,${0.7 + s * 0.25})`,
  (s) => `rgba(100,65,30,${0.45 + s * 0.4})`,
  (s) => `rgba(80,50,20,${0.5 + s * 0.35})`,
  (s) => `rgba(130,95,45,${s * 2.5})`,
]
const structureStyleCache: Array<Map<number, string>> = STRUCTURE_STYLES.map(() => new Map())
function structureStyle(kind: number, s: number): string {
  const cache = structureStyleCache[kind]
  let style = cache.get(s)
  if (style === undefined) {
    if (cache.size >= 4096) cache.clear()
    style = STRUCTURE_STYLES[kind](s)
    cache.set(s, style)
  }
  return style
}

/** Terrain detail drawn per frame: shore foam, lake shimmer, tile decoration, settlement rings and structure. */
export function draw_terrain(f: DrawFrame) {
  const {
    ctx,
    world,
    renderScale,
    tiles,
    fire_intensity,
    structure,
    ox,
    oy,
    r0,
    r1,
    c0,
    c1,
    W,
    H,
    t,
    overview,
    ruinedTiles,
  } = f
  const win = { r0, r1, c0, c1 }
  // Shore foam: geometry is precomputed per terrain rebuild; each frame
  // just fills the paths with animated alpha. The old version rescanned
  // the visible grid twice per frame computing edge masks.
  {
    const foam = _baseKey?.foam
    if (foam) {
      ctx.fillStyle = '#ffffff'
      ctx.globalAlpha = 0.3
      ctx.fill(foam.thin)
      const foamT = t * 0.0014
      for (let bucket = 0; bucket < foam.thick.length; bucket++) {
        const pulse = Math.sin(foamT + (bucket * Math.PI) / 2)
        if (pulse <= 0.25) continue
        ctx.globalAlpha = 0.55 * Math.min(1, (pulse - 0.25) / 0.75)
        ctx.fill(foam.thick[bucket])
      }
      ctx.globalAlpha = 1
    }
  }

  // Lake shimmer - animated sparkle on shallow water tiles (depth 180-253)
  {
    const dm = world.grid.depth_map
    const shimmerT = t * 0.0015
    const waterFx = renderScale < 1 ? getWaterFxLayers(renderScale) : null
    if (waterFx) {
      // Baked shimmer layer: one blit instead of a full-grid scan
      // issuing a fillRect for every pulsing deep-water tile.
      const pulse = 0.5 + 0.5 * Math.sin(shimmerT * 2.1)
      ctx.globalAlpha = 0.28 * (0.3 + 0.7 * pulse)
      ctx.drawImage(waterFx.shimmer, 0, 0, W, H)
      ctx.globalAlpha = 1
    } else {
      ctx.fillStyle = 'rgba(180,230,255,0.28)'
      emitShimmerRects(waterCellIndex(tiles, dm), shimmerT, win, (x, y, w, h) => ctx.fillRect(x, y, w, h))
    }

    // Integer-aligned wavelets stay within the camera window instead of
    // scanning and antialiasing paths across the whole world.
    if (!LOW_PERF && !overview) {
      ctx.fillStyle = 'rgba(140,200,240,0.2)'
      emitWaveletRects(waterCellIndex(tiles, dm), shimmerT, win, (x, y, w, h) => ctx.fillRect(x, y, w, h))
    }
  }

  // Food patches and minerals are baked per (terrain, scale); zoomed-out
  // frames blit that layer and only iterate for the animated tiles
  // (fire/campfire/hut). The naive loop was ~6 fillRects per food tile
  // every frame - hundreds of thousands of calls on grown worlds.
  const bakedDecor = renderScale < 1 ? getTileDecorLayer(renderScale) : null
  if (bakedDecor) ctx.drawImage(bakedDecor, 0, 0, W, H)
  {
    const special = specialTileIndex(tiles)
    const cells = bakedDecor ? special.animated : special.all
    // Frame-constant values for the hut pass.
    const dp = world.day_progress ?? 0.5
    const nightFactor = world.is_day ? 0 : 1 - Math.abs(dp - 0.5) * 2
    const glowAlpha = 0.04 + 0.18 * nightFactor
    const glowStyle = `rgba(255,215,110,${glowAlpha})`
    const hutNight = Math.max(0, Math.min(3, Math.round(nightFactor * 3)))
    const smokeAlpha = !world.is_day && !overview ? 0.25 : 0
    // ?cf=buildings: huts, fires and campfires are SpriteLayer sprites instead.
    const cfSpecial = cfOwns('buildings')
    const hutSprites: Array<ReturnType<typeof getBuildingSprite> | undefined> = new Array(8)
    for (let i = firstCellAtRow(cells, r0); i < cells.length; i += 2) {
      const row = cells[i]
      if (row >= r1) break
      const col = cells[i + 1]
      if (col < c0 || col >= c1) continue
      const tile = tiles[row][col]
      const px = col * TILE
      const py = row * TILE
      const seed = visualTileHash(col + ox, row + oy)

      if (!bakedDecor && tile === TILE_ID.FOOD) {
        drawFoodPatch(ctx, px, py, seed)
      }

      if (!bakedDecor && tile === TILE_ID.MINERAL) {
        drawMineralOutcrop(ctx, px, py, seed)
      }

      if (cfSpecial && tile !== TILE_ID.FOOD && tile !== TILE_ID.MINERAL) continue

      if (tile === TILE_ID.FIRE || tile === TILE_ID.CAMPFIRE) {
        const fi = fire_intensity?.[row]?.[col] ?? 1
        const isCampfire = tile === TILE_ID.CAMPFIRE
        if (!world.is_day && !overview) {
          const fcx = px + TILE / 2
          const fcy = py + TILE / 2
          const flicker = 0.88 + Math.sin(t * 0.011 + col * 3.1 + row * 1.7) * 0.12
          const lr = TILE * (isCampfire ? 4.2 : 3.2) * flicker
          const grad = ctx.createRadialGradient(fcx, fcy, TILE * 0.4, fcx, fcy, lr)
          grad.addColorStop(0, `rgba(255,190,90,${0.36 * fi})`)
          grad.addColorStop(0.45, `rgba(255,150,50,${0.14 * fi})`)
          grad.addColorStop(1, 'rgba(255,120,30,0)')
          ctx.fillStyle = grad
          ctx.fillRect(fcx - lr, fcy - lr, lr * 2, lr * 2)
        }
        drawPixelFire(ctx, px, py, fi, Math.floor(t / 170 + (seed & 7)), isCampfire)
      }

      if (tile === TILE_ID.HUT && (ruinedTiles.size === 0 || !ruinedTiles.has(`${col + ox},${row + oy}`))) {
        const BW = TILE
        const BH = TILE
        const bx = px
        const by = py
        ctx.fillStyle = glowStyle
        ctx.fillRect(bx - TILE / 2, by - TILE / 2, BW + TILE, BH + TILE)
        const hutVariant = (((col * 73856093) ^ (row * 19349663)) >>> 0) & 7
        let hutSprite = hutSprites[hutVariant]
        if (hutSprite === undefined) {
          hutSprite = getBuildingSprite('Hut', 1, 1, TILE, hutVariant, hutNight, 1)
          hutSprites[hutVariant] = hutSprite
        }
        if (hutSprite) {
          ctx.drawImage(
            hutSprite,
            Math.round(bx - SPRITE_PAD),
            Math.round(by + BH + SPRITE_PAD_BOT - hutSprite.height),
          )
        }
        if (smokeAlpha > 0) {
          const now = Date.now()
          for (let s = 0; s < 3; s++) {
            const phase = (now * 0.0008 + s * 0.4) % 1
            ctx.fillStyle = `rgba(180,180,185,${smokeAlpha * (1 - phase)})`
            const smokeSize = 1 + Math.floor(phase * 2)
            ctx.fillRect(
              Math.round(bx + BW / 2 + Math.sin(phase * Math.PI) * 2),
              Math.round(by - phase * 10),
              smokeSize + 1,
              smokeSize,
            )
          }
        }
      }
    }
  }

  // Settlement markers: a town hall over clusters of 5+ huts.
  // Hut tile positions are cached per terrain grid, and the clustering
  // itself (an O(n^2) scan) is cached with them - only the ring drawing
  // is animated per frame.
  {
    const hutPositions = hutTileList(tiles)
    if (hutPositions.length >= 3 && !cfOwns('buildings')) {
      const clusters = cachedHutClusters(hutPositions)
      for (const { cx: cx2, cy: cy2, count: clusterLength } of clusters) {
        const px2 = cx2 * TILE + TILE / 2
        const py2 = cy2 * TILE + TILE / 2
        ctx.save()
        // No ring: town names and the borders layer already mark
        // settlements, and dozens of dashed circles cluttered the map.
        // Town hall icon for large settlements (5+ huts)
        if (clusterLength >= 5) {
          const TH = TILE * 3.5 // town hall icon size
          const tx = px2 - TH / 2
          const ty = py2 - TH / 2
          // Glow
          ctx.fillStyle = 'rgba(255,220,130,0.22)'
          ctx.fillRect(tx - TILE, ty - TILE, TH + TILE * 2, TH + TILE * 2)
          // Main body
          ctx.fillStyle = '#d4b87a'
          ctx.fillRect(tx + 2, ty + TH * 0.36, TH - 4, TH * 0.64 - 1)
          // Main roof
          ctx.fillStyle = '#6a3820'
          ctx.beginPath()
          ctx.moveTo(px2, ty)
          ctx.lineTo(tx + TH, ty + TH * 0.38)
          ctx.lineTo(tx, ty + TH * 0.38)
          ctx.closePath()
          ctx.fill()
          // Central tower
          const tw = TH * 0.22
          const th2 = TH * 0.85
          ctx.fillStyle = '#c0a870'
          ctx.fillRect(px2 - tw / 2, ty - th2 * 0.2, tw, th2 * 0.65)
          ctx.fillStyle = '#6a3820'
          ctx.beginPath()
          ctx.moveTo(px2, ty - th2 * 0.28)
          ctx.lineTo(px2 + tw / 2 + 1, ty - th2 * 0.2)
          ctx.lineTo(px2 - tw / 2 - 1, ty - th2 * 0.2)
          ctx.closePath()
          ctx.fill()
          // Door
          ctx.fillStyle = '#2a1000'
          ctx.fillRect(px2 - TH * 0.06, ty + TH * 0.55, TH * 0.12, TH * 0.45 - 1)
          // Windows
          ctx.fillStyle = 'rgba(255,235,150,0.65)'
          ctx.fillRect(tx + 4, ty + TH * 0.42, 4, 4)
          ctx.fillRect(tx + TH - 8, ty + TH * 0.42, 4, 4)
        }
        ctx.restore()
      }
    }
  }

  if (structure) {
    for (let row = r0; row < r1; row++) {
      const structureRow = structure[row]
      const tileRow = tiles[row]
      for (let col = c0; col < c1; col++) {
        const s = structureRow[col]
        if (s < 0.05) continue
        const t = tileRow[col]
        if (t === 8) continue
        const px = col * TILE
        const py = row * TILE
        const alpha = Math.min(0.95, 0.4 + s * 0.55)
        if (TILE >= 8) {
          const cx2 = px + TILE / 2
          if (s >= 0.7) {
            ctx.fillStyle = structureStyle(0, s)
            ctx.fillRect(px + 1, py + TILE * 0.5, TILE - 2, TILE * 0.5 - 1)
            ctx.fillStyle = structureStyle(1, s)
            ctx.beginPath()
            ctx.moveTo(cx2, py + 2)
            ctx.lineTo(px + TILE - 2, py + TILE * 0.52)
            ctx.lineTo(px + 2, py + TILE * 0.52)
            ctx.closePath()
            ctx.fill()
            ctx.fillStyle = 'rgba(160,140,110,0.5)'
            ctx.fillRect(px + 2, py + TILE * 0.55, 3, 3)
            ctx.fillRect(px + TILE - 5, py + TILE * 0.65, 3, 3)
          } else if (s >= 0.35) {
            ctx.fillStyle = structureStyle(2, s)
            ctx.fillRect(px + 2, py + TILE * 0.45, TILE - 4, TILE * 0.55 - 1)
            ctx.fillStyle = structureStyle(3, s)
            ctx.beginPath()
            ctx.moveTo(cx2 - 1, py + 3)
            ctx.lineTo(px + TILE - 2, py + TILE * 0.47)
            ctx.lineTo(px + 2, py + TILE * 0.47)
            ctx.closePath()
            ctx.fill()
          } else {
            ctx.fillStyle = structureStyle(4, s)
            ctx.fillRect(px + 1, py + TILE * 0.6, TILE - 2, TILE * 0.35)
          }
        } else {
          const r = s >= 0.7 ? 120 : s >= 0.35 ? 100 : 130
          const g = s >= 0.7 ? 90 : s >= 0.35 ? 65 : 95
          const b = s >= 0.7 ? 60 : s >= 0.35 ? 30 : 45
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
          ctx.fillRect(px, py, TILE, TILE)
        }
      }
    }
  }
}
