import type { WorldState } from '../../../shared/types'

import { lineageColor } from '../../../shared/constants'

import {
  buildTerritoryIndex,
  territoryEmphasis,
  territoryStanding,
  territoryTileKey,
} from '../../model/territory'

import { TILE } from '../../model/palette'

import { drawClouds, scratchA, scratchB } from '.././decorations'
import { firstPairAtRow } from '.././grid-cells'
import { PATH_TRAIL_HOT } from '../../../shared/types'
import type { DrawFrame } from './frame'

// Path traffic arrives as whole percents, so a frame draws hundreds of worn-track tiles
// from at most ~50 distinct strengths: build each style string once.
const pathTrailStyles = new Map<number, string>()
function pathTrailStyle(p: number): string {
  let style = pathTrailStyles.get(p)
  if (style === undefined) {
    if (pathTrailStyles.size >= 4096) pathTrailStyles.clear()
    style = `rgba(160,130,80,${Math.min(0.28, p * 0.3)})`
    pathTrailStyles.set(p, style)
  }
  return style
}

/** Map overlays (hazard, fertility, trails, age, threat, density, territory, history) and the view-flag layers. */
export function draw_overlays(f: DrawFrame) {
  const {
    ctx,
    world,
    overlay,
    focus,
    viewFlags,
    width,
    height,
    structure,
    food_trail,
    water_trail,
    path_trail,
    fertility,
    hazard,
    ox,
    oy,
    r0,
    r1,
    c0,
    c1,
    organisms,
    W,
    H,
    t,
  } = f
  if (overlay === 'hazard' && world.grid.hazard) {
    const haz = world.grid.hazard
    for (let row = r0; row < r1; row++) {
      const r = haz[row]
      if (!r) continue
      for (let col = c0; col < c1; col++) {
        const v = r[col] ?? 0
        if (v < 0.05) continue
        ctx.fillStyle = `rgba(220,40,30,${Math.min(0.75, v * 0.9)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (overlay === 'fertility' && world.grid.fertility) {
    const fer = world.grid.fertility
    for (let row = r0; row < r1; row++) {
      const r = fer[row]
      if (!r) continue
      for (let col = c0; col < c1; col++) {
        const v = r[col] ?? 0
        if (v < 0.1) continue
        ctx.fillStyle = `rgba(80,200,80,${Math.min(0.55, v * 0.6)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (overlay === 'structures' && world.grid.structure) {
    const str = world.grid.structure
    for (let row = r0; row < r1; row++) {
      const r = str[row]
      if (!r) continue
      for (let col = c0; col < c1; col++) {
        const v = r[col] ?? 0
        if (v < 0.05) continue
        ctx.fillStyle = `rgba(255,170,60,${Math.min(0.7, v * 0.8)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (overlay === 'trails') {
    const ft = world.grid.food_trail
    const wt = world.grid.water_trail
    const pt = world.grid.path_trail
    for (let row = r0; row < r1; row++) {
      const fr = ft?.[row]
      const wr = wt?.[row]
      const pr = pt?.[row]
      for (let col = c0; col < c1; col++) {
        const f = fr?.[col] ?? 0
        const w = wr?.[col] ?? 0
        const p = pr?.[col] ?? 0
        if (f < 0.05 && w < 0.05 && p < 0.05) continue
        const r = Math.round(255 * f + 70 * w + 40 * p)
        const g = Math.round(200 * f + 130 * w + 200 * p)
        const b = Math.round(40 * f + 220 * w + 70 * p)
        const a = Math.min(0.65, (f + w + p) * 0.5)
        ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(2)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (overlay === 'age') {
    const n = height * width
    const sum = scratchA(n)
    const cnt = scratchB(n)
    for (const org of organisms) {
      if (!org.alive) continue
      const tx = Math.round(org.x - ox),
        ty = Math.round(org.y - oy)
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = tx + dx,
            ny = ty + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const idx = ny * width + nx
          sum[idx] += org.age
          cnt[idx] += 1
        }
      }
    }
    for (let row = r0; row < r1; row++) {
      const rowBase = row * width
      for (let col = c0; col < c1; col++) {
        const idx = rowBase + col
        const c = cnt[idx]
        if (c === 0) continue
        const t = Math.min(1, sum[idx] / c / 3000)
        const r = Math.round(80 + t * 175)
        const g = Math.round(220 - t * 140)
        const b = Math.round(180 - t * 160)
        ctx.fillStyle = `rgba(${r},${g},${b},0.55)`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (overlay === 'threat') {
    const n = height * width
    const heat = scratchA(n)
    for (const org of organisms) {
      if (!org.alive || (org.fear_level ?? 0) < 0.3) continue
      const tx = Math.round(org.x - ox),
        ty = Math.round(org.y - oy)
      const R = 3
      const f = org.fear_level ?? 0
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.abs(dx) + Math.abs(dy)
          if (d > R) continue
          const nx = tx + dx,
            ny = ty + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          heat[ny * width + nx] += (f * (R - d + 1)) / (R + 1)
        }
      }
    }
    for (let row = r0; row < r1; row++) {
      const rowBase = row * width
      for (let col = c0; col < c1; col++) {
        const v = heat[rowBase + col]
        if (v < 0.15) continue
        const t = Math.min(1, v / 2)
        ctx.fillStyle = `rgba(255,${Math.round(140 - t * 100)},${Math.round(60 - t * 40)},${(0.3 + t * 0.4).toFixed(2)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (overlay === 'density') {
    const n = height * width
    const grid2d = scratchA(n)
    for (const org of organisms) {
      if (!org.alive) continue
      const tx2 = Math.round(org.x - ox),
        ty2 = Math.round(org.y - oy)
      const R = 4
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.abs(dx) + Math.abs(dy)
          if (d > R) continue
          const nx = tx2 + dx,
            ny = ty2 + dy
          if (nx >= 0 && ny >= 0 && ny < height && nx < width) {
            grid2d[ny * width + nx] += R - d + 1
          }
        }
      }
    }
    let maxD = 1
    for (let k = 0; k < n; k++) if (grid2d[k] > maxD) maxD = grid2d[k]
    for (let row = r0; row < r1; row++) {
      const rowBase = row * width
      for (let col = c0; col < c1; col++) {
        const v = grid2d[rowBase + col]
        if (v < 1) continue
        const t2 = Math.min(v / maxD, 1)
        ctx.fillStyle = `rgba(${Math.round(80 + t2 * 175)},${Math.round(200 - t2 * 100)},${Math.round(255 - t2 * 200)},${0.25 + t2 * 0.45})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (viewFlags.territory && world.territory) {
    const index = buildTerritoryIndex(world.territory)
    const focusedLineage = focus.startsWith('lineage:') ? focus.slice('lineage:'.length) : null

    for (const claim of world.territory.claimed) {
      const standing = territoryStanding(claim.lid, focusedLineage, world.tribal_relations)
      const emphasis = territoryEmphasis(standing)
      const color = lineageColor(claim.lid)
      const fill = color.replace('hsl(', 'hsla(').replace(')', `, ${emphasis.fillAlpha})`)
      const border =
        emphasis.borderColor ??
        color
          .replace(/(\d+)%\)$/, (_, lightness) => `${Math.max(15, Number(lightness) - 24)}%, 0.9)`)
          .replace('hsl(', 'hsla(')

      ctx.beginPath()
      for (const [worldTileX, worldTileY] of claim.tiles) {
        const col = worldTileX - ox
        const row = worldTileY - oy
        if (col < c0 || col >= c1 || row < r0 || row >= r1) continue
        ctx.rect(col * TILE, row * TILE, TILE, TILE)
      }
      ctx.fillStyle = fill
      ctx.fill()

      ctx.beginPath()
      const owns = (x: number, y: number) =>
        index.ownersByTile.get(territoryTileKey(x, y))?.includes(claim.lid) === true
      for (const [worldTileX, worldTileY] of claim.tiles) {
        const col = worldTileX - ox
        const row = worldTileY - oy
        if (col < c0 || col >= c1 || row < r0 || row >= r1) continue
        const px = col * TILE
        const py = row * TILE
        if (!owns(worldTileX, worldTileY - 1)) {
          ctx.moveTo(px, py)
          ctx.lineTo(px + TILE, py)
        }
        if (!owns(worldTileX + 1, worldTileY)) {
          ctx.moveTo(px + TILE, py)
          ctx.lineTo(px + TILE, py + TILE)
        }
        if (!owns(worldTileX, worldTileY + 1)) {
          ctx.moveTo(px + TILE, py + TILE)
          ctx.lineTo(px, py + TILE)
        }
        if (!owns(worldTileX - 1, worldTileY)) {
          ctx.moveTo(px, py + TILE)
          ctx.lineTo(px, py)
        }
      }
      ctx.strokeStyle = border
      ctx.lineWidth = emphasis.borderWidth
      ctx.stroke()
    }

    if (world.territory.contested.length > 0) {
      const pulse = 0.12 + Math.abs(Math.sin(t / 420)) * 0.16
      ctx.beginPath()
      for (const [worldTileX, worldTileY] of world.territory.contested) {
        const col = worldTileX - ox
        const row = worldTileY - oy
        if (col < c0 || col >= c1 || row < r0 || row >= r1) continue
        ctx.rect(col * TILE, row * TILE, TILE, TILE)
      }
      ctx.fillStyle = `rgba(255,255,255,${pulse})`
      ctx.fill()
    }
  }

  drawClouds(ctx, W, H, world.weather, t)

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

  if (viewFlags.fertility && fertility) {
    ctx.save()
    for (let row = r0; row < r1; row++) {
      const r = fertility[row]
      if (!r) continue
      for (let col = c0; col < c1; col++) {
        const f = r[col]
        if (f == null) continue
        if (f > 0.55) {
          ctx.fillStyle = `rgba(80,180,80,${Math.min(0.45, (f - 0.55) * 1.2)})`
          ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
        } else if (f < 0.25) {
          ctx.fillStyle = `rgba(150,90,50,${Math.min(0.45, (0.25 - f) * 1.5)})`
          ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
        }
      }
    }
    ctx.restore()
  }

  if (viewFlags.hazard && hazard) {
    ctx.save()
    for (let row = r0; row < r1; row++) {
      const r = hazard[row]
      if (!r) continue
      for (let col = c0; col < c1; col++) {
        const h = r[col]
        if (h == null || h < 0.02) continue
        ctx.fillStyle = `rgba(200,40,40,${Math.min(0.55, h * 0.9)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
    ctx.restore()
  }

  // Always show high-traffic paths subtly (helps map feel lived-in)
  if (path_trail) {
    ctx.save()
    const hot = world.grid.path_trail_hot
    if (hot) {
      // Only the busy cells were listed when the frame was decoded; walk those, in the
      // same row-major order as the full scan below.
      for (let i = firstPairAtRow(hot, r0); i < hot.length; i += 2) {
        const row = hot[i]
        if (row >= r1) break
        const col = hot[i + 1]
        if (col < c0 || col >= c1) continue
        const p = path_trail[row]?.[col] ?? 0
        if (p < PATH_TRAIL_HOT) continue
        ctx.fillStyle = pathTrailStyle(p)
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    } else {
      for (let row = r0; row < r1; row++) {
        const pr = path_trail[row]
        if (!pr) continue
        for (let col = c0; col < c1; col++) {
          const p = pr[col] ?? 0
          if (p < PATH_TRAIL_HOT) continue
          ctx.fillStyle = pathTrailStyle(p)
          ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
        }
      }
    }
    ctx.restore()
  }

  if (viewFlags.trails && (food_trail || water_trail || path_trail)) {
    ctx.save()
    for (let row = r0; row < r1; row++) {
      for (let col = c0; col < c1; col++) {
        const f = food_trail?.[row]?.[col] ?? 0
        const w = water_trail?.[row]?.[col] ?? 0
        const p = path_trail?.[row]?.[col] ?? 0
        if (f < 0.1 && w < 0.1 && p < 0.1) continue
        if (p >= 0.1) {
          ctx.fillStyle = `rgba(220,220,220,${Math.min(0.35, p * 0.5)})`
          ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
        }
        if (f >= 0.1) {
          ctx.fillStyle = `rgba(240,220,80,${Math.min(0.4, f * 0.5)})`
          ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
        }
        if (w >= 0.1) {
          ctx.fillStyle = `rgba(100,170,240,${Math.min(0.4, w * 0.5)})`
          ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
        }
      }
    }
    ctx.restore()
  }

  if (viewFlags.structures && structure) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,210,140,0.7)'
    ctx.lineWidth = 1
    for (let row = r0; row < r1; row++) {
      const r = structure[row]
      if (!r) continue
      for (let col = c0; col < c1; col++) {
        if (r[col] && r[col] > 0.1) {
          ctx.strokeRect(col * TILE + 0.5, row * TILE + 0.5, TILE - 1, TILE - 1)
        }
      }
    }
    ctx.restore()
  }

  if (viewFlags.partners) {
    // Pre-filter to partnered orgs before building the lookup map.
    // Most orgs are unpartnered; building a full byId map of all
    // organisms is wasted work each frame.
    const partnered: WorldState['organisms'] = []
    for (const o of organisms) {
      if (o.alive && o.partner_id) partnered.push(o)
    }
    if (partnered.length >= 2) {
      const byId = new Map<string, (typeof partnered)[number]>()
      for (const o of partnered) byId.set(o.id, o)
      ctx.save()
      ctx.strokeStyle = 'rgba(255,170,200,0.55)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (const org of partnered) {
        if (!org.partner_id) continue
        if (org.id >= org.partner_id) continue
        const partner = byId.get(org.partner_id)
        if (!partner) continue
        const ax = (org.x - ox) * TILE + TILE / 2
        const ay = (org.y - oy) * TILE + TILE / 2
        const bx = (partner.x - ox) * TILE + TILE / 2
        const by = (partner.y - oy) * TILE + TILE / 2
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
      }
      // Single stroke() at the end instead of per-edge - cuts state-
      // change overhead when there are many partnered pairs.
      ctx.stroke()
      ctx.restore()
    }
  }
}
