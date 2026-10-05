import type { WorldState } from '../../../../shared/types'
import { lineageColor } from '../../../../shared/constants'
import { LOW_PERF } from '../../../../shared/perf'
import { TILE } from '../../../model/palette'
import { TILE_ID } from '../../../model/terrain-ids'
import {
  buildTerritoryIndex,
  territoryEmphasis,
  territoryStanding,
  territoryTileKey,
} from '../../../model/territory'
import { zoomDetailLevel } from '../../character-visuals'
import { drawClouds } from '../../decorations'
import { firstCellAtRow, specialTileIndex } from '../../special-tiles'
import { emitShimmerRects, emitStarRects, emitWaveletRects, waterCellIndex } from '../../water-fx'
import type { CfFrame } from './frame'

type Ctx = CanvasRenderingContext2D

/** Clouds drifting over the ground (they were part of `draw_overlays`). */
export function paintClouds(ctx: Ctx, f: CfFrame): void {
  drawClouds(ctx, f.W, f.H, f.world.weather, f.t)
}

/** Lineage track lines and the player-facing partner links. */
export function paintLines(ctx: Ctx, f: CfFrame): void {
  const { world, viewFlags, organisms, ox, oy } = f
  if (viewFlags.history && world.lineage_centroid_history) {
    ctx.save()
    ctx.lineWidth = 1.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const [lid, samples] of Object.entries(world.lineage_centroid_history)) {
      if (!samples || samples.length < 2) continue
      const hsl = lineageColor(lid)
      for (let i = 1; i < samples.length; i++) {
        const [, x0, y0] = samples[i - 1]
        const [, x1, y1] = samples[i]
        const a = 0.15 + 0.7 * (i / samples.length)
        ctx.strokeStyle = hsl.replace('hsl(', 'hsla(').replace(')', `, ${a.toFixed(2)})`)
        ctx.beginPath()
        ctx.moveTo((x0 - ox) * TILE + TILE / 2, (y0 - oy) * TILE + TILE / 2)
        ctx.lineTo((x1 - ox) * TILE + TILE / 2, (y1 - oy) * TILE + TILE / 2)
        ctx.stroke()
      }
      const [, lx, ly] = samples[samples.length - 1]
      ctx.fillStyle = hsl.replace('hsl(', 'hsla(').replace(')', ', 0.95)')
      ctx.beginPath()
      ctx.arc((lx - ox) * TILE + TILE / 2, (ly - oy) * TILE + TILE / 2, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  if (viewFlags.partners) {
    const partnered: WorldState['organisms'] = []
    for (const o of organisms) if (o.alive && o.partner_id) partnered.push(o)
    if (partnered.length >= 2) {
      const byId = new Map<string, (typeof partnered)[number]>()
      for (const o of partnered) byId.set(o.id, o)
      ctx.save()
      ctx.strokeStyle = 'rgba(255,170,200,0.55)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (const org of partnered) {
        if (!org.partner_id || org.id >= org.partner_id) continue
        const partner = byId.get(org.partner_id)
        if (!partner) continue
        ctx.moveTo((org.x - ox) * TILE + TILE / 2, (org.y - oy) * TILE + TILE / 2)
        ctx.lineTo((partner.x - ox) * TILE + TILE / 2, (partner.y - oy) * TILE + TILE / 2)
      }
      ctx.stroke()
      ctx.restore()
    }
  }
}

/** Territory borders: an edge segment wherever a claim's tile has a neighbour the claim does not own. */
export function paintTerritoryBorders(ctx: Ctx, world: WorldState, focus: string): void {
  if (!world.territory) return
  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
  const index = buildTerritoryIndex(world.territory)
  const focused = focus.startsWith('lineage:') ? focus.slice('lineage:'.length) : null
  for (const claim of world.territory.claimed) {
    const standing = territoryStanding(claim.lid, focused, world.tribal_relations)
    const emphasis = territoryEmphasis(standing)
    const color = lineageColor(claim.lid)
    const border =
      emphasis.borderColor ??
      color
        .replace(/(\d+)%\)$/, (_, lightness) => `${Math.max(15, Number(lightness) - 24)}%, 0.9)`)
        .replace('hsl(', 'hsla(')
    ctx.beginPath()
    const owns = (x: number, y: number) =>
      index.ownersByTile.get(territoryTileKey(x, y))?.includes(claim.lid) === true
    for (const [tx, ty] of claim.tiles) {
      const px = (tx - ox) * TILE
      const py = (ty - oy) * TILE
      if (!owns(tx, ty - 1)) {
        ctx.moveTo(px, py)
        ctx.lineTo(px + TILE, py)
      }
      if (!owns(tx + 1, ty)) {
        ctx.moveTo(px + TILE, py)
        ctx.lineTo(px + TILE, py + TILE)
      }
      if (!owns(tx, ty + 1)) {
        ctx.moveTo(px + TILE, py + TILE)
        ctx.lineTo(px, py + TILE)
      }
      if (!owns(tx - 1, ty)) {
        ctx.moveTo(px, py + TILE)
        ctx.lineTo(px, py)
      }
    }
    ctx.strokeStyle = border
    ctx.lineWidth = emphasis.borderWidth
    ctx.stroke()
  }
}

/** Star glints on the water at dusk and night (and a faint one by day), as the atmosphere painter made them. */
export function paintWaterStars(ctx: Ctx, f: CfFrame): void {
  const { world, t, bounds } = f
  if (!(!world.is_day || (world.day_progress ?? 0) > 0.05)) return
  ctx.fillStyle = world.is_day ? 'rgba(255,255,255,0.55)' : 'rgba(180,200,240,0.30)'
  emitStarRects(waterCellIndex(world.grid.tiles, world.grid.depth_map), t * 0.001, bounds, (x, y, w, h) =>
    ctx.fillRect(x, y, w, h),
  )
}

/** Shimmer on deep water and the little wave dashes. */
export function paintWaterShimmer(ctx: Ctx, f: CfFrame): void {
  const { world, t, bounds, zoom } = f
  const cells = waterCellIndex(world.grid.tiles, world.grid.depth_map)
  const shimmerT = t * 0.0015
  ctx.fillStyle = 'rgba(180,230,255,0.28)'
  emitShimmerRects(cells, shimmerT, bounds, (x, y, w, h) => ctx.fillRect(x, y, w, h))
  if (!LOW_PERF && zoomDetailLevel(zoom) !== 'overview') {
    ctx.fillStyle = 'rgba(140,200,240,0.2)'
    emitWaveletRects(cells, shimmerT, bounds, (x, y, w, h) => ctx.fillRect(x, y, w, h))
  }
}

/** The warm pool of light round fires and campfires after dark. */
export function paintFireGlow(ctx: Ctx, f: CfFrame): void {
  const { world, t, bounds, zoom } = f
  if (world.is_day || zoomDetailLevel(zoom) === 'overview') return
  const { tiles, fire_intensity } = world.grid
  const cells = specialTileIndex(tiles).animated
  const { c0, c1, r0, r1 } = bounds
  for (let i = firstCellAtRow(cells, r0); i < cells.length; i += 2) {
    const row = cells[i]
    if (row >= r1) break
    const col = cells[i + 1]
    if (col < c0 || col >= c1) continue
    const tile = tiles[row][col]
    if (tile !== TILE_ID.FIRE && tile !== TILE_ID.CAMPFIRE) continue
    const fi = fire_intensity?.[row]?.[col] ?? 1
    const fcx = col * TILE + TILE / 2
    const fcy = row * TILE + TILE / 2
    const flicker = 0.88 + Math.sin(t * 0.011 + col * 3.1 + row * 1.7) * 0.12
    const lr = TILE * (tile === TILE_ID.CAMPFIRE ? 4.2 : 3.2) * flicker
    const grad = ctx.createRadialGradient(fcx, fcy, TILE * 0.4, fcx, fcy, lr)
    grad.addColorStop(0, `rgba(255,190,90,${0.36 * fi})`)
    grad.addColorStop(0.45, `rgba(255,150,50,${0.14 * fi})`)
    grad.addColorStop(1, 'rgba(255,120,30,0)')
    ctx.fillStyle = grad
    ctx.fillRect(fcx - lr, fcy - lr, lr * 2, lr * 2)
  }
}
