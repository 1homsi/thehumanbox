import { getWaterFxLayers } from '.././base-layer'

import { isPermanentWaterTile } from '../../model/terrain-ids'

import { LOW_PERF } from '../../../shared/perf'

import { TILE } from '../../model/palette'

import type { DrawFrame } from './frame'

/** Season tint, day and night light, hard winter, weather and drought. */
export function draw_atmosphere(f: DrawFrame) {
  const { ctx, world, renderScale, tiles, r0, r1, c0, c1, W, H, t } = f
  const sp = world.season_progress ?? 0.5
  const seasonTints: Record<string, [number, number, number, number]> = {
    decline: [180, 110, 30, 0.05 + sp * 0.06],
    scarcity: [95, 70, 40, 0.07 + sp * 0.07],
    recovery: [40, 130, 150, 0.04 + (1 - sp) * 0.05],
  }
  const skyTint = seasonTints[world.season]
  if (skyTint) {
    ctx.fillStyle = `rgba(${skyTint[0]},${skyTint[1]},${skyTint[2]},${skyTint[3]})`
    ctx.fillRect(0, 0, W, H)
  }

  {
    const dp = world.day_progress ?? 0.5
    if (!world.is_day) {
      const mid = Math.max(0, 1 - Math.abs(dp - 0.85) * 4)
      ctx.fillStyle = `rgba(14,20,58,${0.22 + mid * 0.1})`
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = `rgba(80,110,200,${0.05 + mid * 0.03})`
      ctx.fillRect(0, 0, W, H)
    } else if (dp < 0.12) {
      const k = (0.12 - dp) / 0.12
      ctx.fillStyle = `rgba(255,160,80,${k * 0.14})`
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = `rgba(120,80,160,${k * 0.06})`
      ctx.fillRect(0, 0, W, H)
    } else if (dp > 0.55) {
      const k = Math.min(1, (dp - 0.55) / 0.15)
      ctx.fillStyle = `rgba(235,120,60,${k * 0.15})`
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = `rgba(150,70,140,${k * 0.05})`
      ctx.fillRect(0, 0, W, H)
    }
  }

  // A hard winter: a cold grey sky and snow that keeps falling, rain or not.
  const hardWinter = !!world.hard_winter && world.season === 'scarcity'
  if (hardWinter) {
    ctx.fillStyle = 'rgba(196,214,232,0.09)'
    ctx.fillRect(0, 0, W, H)
    const wx = world.weather?.wind_x ?? 0.3
    const flakes = LOW_PERF ? 160 : 320
    for (let i = 0; i < flakes; i++) {
      const drift = Math.sin(t * 0.0011 + i * 1.3) * 7 + wx * 14
      const fx = (((i * 137 + t * 0.1 + drift) % W) + W) % W
      const fy = (i * 251 + t * (0.18 + (i % 3) * 0.05)) % H
      const size = 1 + ((i * 7) % 2)
      ctx.fillStyle = `rgba(245,249,255,${0.5 + ((i * 13) % 5) * 0.08})`
      ctx.fillRect(fx, fy, size, size)
    }
  }

  if (world.weather && world.weather.kind !== 'clear') {
    const wi = Math.max(0, Math.min(1, world.weather.intensity ?? 0))
    const kind = world.weather.kind
    if (kind === 'storm') {
      ctx.fillStyle = `rgba(40,55,90,${0.06 + wi * 0.1})`
      ctx.fillRect(0, 0, W, H)
    } else if (kind === 'rain') {
      ctx.fillStyle = `rgba(70,90,130,${0.04 + wi * 0.06})`
      ctx.fillRect(0, 0, W, H)
    } else {
      ctx.fillStyle = 'rgba(35,45,60,0.07)'
      ctx.fillRect(0, 0, W, H)
    }
    if (kind === 'rain' || kind === 'storm') {
      const isStorm = kind === 'storm'
      const wx = world.weather.wind_x ?? 0.4
      const wy = world.weather.wind_y ?? 0.0
      if (world.season === 'scarcity' && !isStorm && !hardWinter) {
        ctx.fillStyle = `rgba(240,246,255,${0.35 + wi * 0.3})`
        const flakes = Math.round(90 * (0.4 + wi * 0.6))
        for (let i = 0; i < flakes; i++) {
          const drift = Math.sin(t * 0.0012 + i * 1.7) * 6 + wx * 10
          const sxp = (i * 137 + t * 0.12 + drift) % W
          const syp = (i * 251 + t * 0.25) % H
          const sz = 1 + ((i * 7) % 2)
          ctx.fillRect(sxp, syp, sz, sz)
        }
      } else if (!(hardWinter && !isStorm)) {
        ctx.strokeStyle = isStorm
          ? `rgba(180,195,230,${0.1 + wi * 0.1})`
          : `rgba(170,190,225,${0.08 + wi * 0.08})`
        ctx.lineWidth = 1
        const streaks = Math.round((isStorm ? 80 : 50) * (0.4 + wi * 0.6))
        const baseSlant = isStorm ? 10 : 6
        const slantX = wx * baseSlant
        const slantY = (1 + wy * 0.5) * 8
        ctx.beginPath()
        for (let i = 0; i < streaks; i++) {
          const sxp = (i * 137 + t * 0.7) % W
          const syp = (i * 251 + t * (isStorm ? 1.4 : 1.0)) % H
          ctx.moveTo(sxp, syp)
          ctx.lineTo(sxp + slantX, syp + slantY)
        }
        ctx.stroke()
      }
    }
  }

  if (world.drought === true) {
    const shimmer = (Math.sin(t * 0.001) * 0.5 + 0.5) * 0.04
    ctx.fillStyle = `rgba(255,180,80,${shimmer})`
    ctx.fillRect(0, 0, W, H)
  }

  if (!world.is_day || (world.day_progress ?? 0) > 0.05) {
    const waterFx = renderScale < 1 ? getWaterFxLayers(renderScale) : null
    if (waterFx) {
      // Baked star layer: one alpha-animated blit instead of a
      // stride-2 scan over every water tile issuing thousands of
      // 2x1 fillRects.
      const blink = 0.5 + 0.5 * Math.sin(t * 0.0017)
      ctx.globalAlpha = (world.is_day ? 0.55 : 0.42) * (0.35 + 0.65 * blink)
      ctx.drawImage(waterFx.stars, 0, 0, W, H)
      ctx.globalAlpha = 1
    } else {
      const tt = t * 0.001
      ctx.fillStyle = world.is_day ? 'rgba(255,255,255,0.55)' : 'rgba(180,200,240,0.30)'
      // Align to even boundaries so the star-on-water pattern stays
      // stable as the camera pans (stride-2 sampling must visit the
      // same cells from frame to frame).
      for (let row = r0 & ~1; row < r1; row += 2) {
        for (let col = c0 & ~1; col < c1; col += 2) {
          if (!isPermanentWaterTile(tiles[row]?.[col])) continue
          let h = (col * 374761393 + row * 668265263) | 0
          h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
          const phase = ((h & 0xff) / 255) * Math.PI * 2
          const blink = Math.sin(tt * 1.7 + phase) + Math.sin(tt * 0.9 + phase * 1.3)
          if (blink < 1.3) continue
          const px = col * TILE + ((h >>> 8) & 3)
          const py = row * TILE + ((h >>> 10) & 3)
          ctx.fillRect(px, py, 2, 1)
        }
      }
    }
  }
}
