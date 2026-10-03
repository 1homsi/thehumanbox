import { cachedRailLinks, drawEraTraffic } from './rails'
import {
  _baseKey,
  cachedHutClusters,
  drawTradeNetwork2D,
  getBaseLayerCanvas,
  getScaledBase,
  getTileDecorLayer,
  getWaterFxLayers,
  hutTileList,
  ruinedBuildingTiles,
} from './base-layer'
import {
  ERA_STRIPE_COLOR,
  MONSTER_SIZES,
  SPECIALTY_EMOJI,
  _animalLastPos,
  _orgLastPos,
  drawCanineSprite,
  drawFoodPatch,
  drawMineralOutcrop,
  drawPixelFire,
  lineageEraTiers,
  orgMotion,
  pickToolEmoji,
  visualTileHash,
} from './draw-helpers'
import { drawBoat } from './boat-sprite'
import { crowdLabelIds, LabelPlacer, labelWidth } from './crowd-detail'
import { drawWorkActivity, workActivity } from './activity-visuals'

import { drawFaunaSprite } from './fauna-sprites'
import { drawPixelFauna } from './pixel-fauna'

import { drawEmote, emoteFor } from './activity-emotes'

import type { OrganismState, WorldState } from '../../shared/types'

import { type ViewFlags } from '../../state/store'
import { lineageColor } from '../../shared/constants'
import {
  drawPeopleTile,
  getPeopleAtlas,
  pickAnimalTile,
  pickHumanSprite,
  ATLAS_CREATURE,
  drawTile,
} from '../../shared/sprites'
import { compareBuildingsByDepth, drawBuilding, RUIN_CRUMBLE_TICKS } from './buildings2d'
import { getBuildingSprite, PAD as SPRITE_PAD, PAD_BOT as SPRITE_PAD_BOT } from './building-sprites'
import { normalizeLineageEras } from '../../shared/lineageEras'

import { farmCropColor, farmProgress, farmStage } from '../model/farms'
import { drawPlanting } from './plantings'
import { drawBlessings, drawFireworks, updateWorldMoments } from './world-moments'
import { drawPrayerBubble, mergePrayerBubbles, prayerBubbleScale } from './prayer-bubbles'
import { PERIL_HELP, remainingLine } from '../model/tribe-peril'

import { drawSmog } from './smog'
import { battleAge, drawBattle } from './battles'
import { drawWard } from './wards'
import { motionTime } from '../../shared/motion'
import { drawFestival } from './festivals'
import {
  drawSettlementLabels,
  labelScale,
  placeSettlementLabels,
  subFont,
  titleFont,
  type PlacedLabel,
  type SettlementLabel,
} from './settlement-labels'
import {
  celebrating,
  drawCelebrationGlyph,
  drawPrayerFeedback,
  drawPrayingGlyph,
  updatePrayerFeedback,
} from './prayer-feedback'
import { drawRail, drawTrain, padEmpty, trainProgress } from './era-traffic'
import { prayerTimeLeft } from '../model/prayers'

import { strategyBeaconPositions, strategyTimeLabel } from '../model/strategy-visuals'
import { TILE_ID, isPermanentWaterTile } from '../model/terrain-ids'
import { permanentWaterDepth } from '../model/terrain-visuals'
import { getBuildingState } from '../model/building-state'
import {
  buildTerritoryIndex,
  territoryEmphasis,
  territoryStanding,
  territoryTileKey,
} from '../model/territory'

import { LOW_PERF } from '../../shared/perf'

import {
  deterministicAppearanceIndex,
  resolveAgeStage,
  zoomDetailLevel,
  characterMotion,
  characterFrame,
  compareCharacterDepth,
  selectCrowdSpriteRepresentatives,
} from './character-visuals'
import { TILE, THOUGHT_COLORS } from '../model/palette'
import { orgVariant } from '../model/org-variant'
import { drawTreeSway, drawClouds, scratchA, scratchB } from './decorations'

const fpsSamples: number[] = []

export function drawWorldOnCanvas(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  selectedOrgId: string | null,
  overlay: string | null,
  focus: string,
  viewFlags: ViewFlags,
  bounds?: { c0: number; c1: number; r0: number; r1: number },
  cameraZoom = 1,
  renderScale = 1,
) {
  const { width, height, tiles, fire_intensity, structure } = world.grid
  const { food_trail, water_trail, path_trail, fertility, hazard } = world.grid
  if (!tiles || tiles.length < height) return
  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
  // Clip per-tile overlay loops to the visible window when bounds is
  // provided. Bounds is computed by the caller from camera + dims and
  // already includes a margin. When zoomed out (whole world visible)
  // the bounds collapse to the full grid, so this is a no-op.
  const r0 = bounds?.r0 ?? 0
  const r1 = bounds?.r1 ?? height
  const c0 = bounds?.c0 ?? 0
  const c1 = bounds?.c1 ?? width
  // Prefer the viewport-filtered list (smaller) but fall back to the
  // full cache when it's empty. `??` alone returns [] when viewport is
  // an empty array, which silently hid all animals if the wire ever
  // shipped a frame with `animals: []` even though the cache held many.
  const orgPick =
    world.viewport_organisms && world.viewport_organisms.length > 0
      ? world.viewport_organisms
      : (world.organisms ?? [])
  const animalPick =
    world.viewport_animals && world.viewport_animals.length > 0
      ? world.viewport_animals
      : (world.animals ?? [])
  const organisms = orgPick
  const animals = animalPick
  const W = width * TILE
  const H = height * TILE
  const t = Date.now()
  // Zoomed-out frames skip the per-tile eye candy (fire glow gradients,
  // hut smoke, wavelets): hundreds of gradient/particle draws over
  // sub-2px tiles are invisible there but dominated frame time.
  const overview = zoomDetailLevel(cameraZoom) === 'overview'
  const ruinedTiles = ruinedBuildingTiles(world.buildings)
  // Below full resolution the frame is a minification, so bilinear
  // filtering matches what the GPU's LINEAR texture sampling showed
  // before; at 1:1 keep hard pixel-art edges.
  ctx.imageSmoothingEnabled = renderScale < 1

  const base = getBaseLayerCanvas(world)
  if (!base) return
  if (renderScale < 1) {
    const scaled = getScaledBase(renderScale)
    if (scaled) {
      ctx.drawImage(scaled, 0, 0, W, H)
    } else {
      ctx.drawImage(base, 0, 0)
    }
  } else {
    ctx.drawImage(base, 0, 0)
  }
  if (!overview && !LOW_PERF && renderScale >= 1) {
    drawTreeSway(
      ctx,
      t,
      { x0: c0 * TILE, y0: r0 * TILE, x1: c1 * TILE, y1: r1 * TILE },
      { storm: world.weather?.kind === 'storm', windX: world.weather?.wind_x ?? 0 },
    )
  }

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
      for (let row = r0; row < r1; row++) {
        for (let col = c0; col < c1; col++) {
          const d = permanentWaterDepth(tiles[row]?.[col], dm?.[row]?.[col])
          if (d === null || d < 180) continue
          let h = (col * 374761393 + row * 668265263) | 0
          h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
          const pulse = Math.sin(shimmerT * 2.1 + ((h & 0xff) / 255) * Math.PI * 2)
          if (pulse < 0.6) continue
          ctx.fillRect(col * TILE + ((h >>> 8) & 3), row * TILE + ((h >>> 10) & 3), 2, 1)
        }
      }
    }

    // Integer-aligned wavelets stay within the camera window instead of
    // scanning and antialiasing paths across the whole world.
    if (!LOW_PERF && !overview) {
      ctx.fillStyle = 'rgba(140,200,240,0.2)'
      const wavePhase = Math.floor(shimmerT * 3)
      for (let row = r0; row < r1; row += 2) {
        for (let col = c0; col < c1; col++) {
          const d = permanentWaterDepth(tiles[row]?.[col], dm?.[row]?.[col])
          if (d === null || d < 180) continue
          let h = (col * 374761393 + row * 668265263) | 0
          h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
          if ((h + wavePhase) % 7 !== 0) continue
          const wx = col * TILE + 1 + ((h >>> 8) & 1)
          const wy = row * TILE + 2 + ((wavePhase + (h >>> 10)) & 3)
          ctx.fillRect(wx, wy, 3, 1)
        }
      }
    }
  }

  // Food patches and minerals are baked per (terrain, scale); zoomed-out
  // frames blit that layer and only iterate for the animated tiles
  // (fire/campfire/hut). The naive loop was ~6 fillRects per food tile
  // every frame - hundreds of thousands of calls on grown worlds.
  const bakedDecor = renderScale < 1 ? getTileDecorLayer(renderScale) : null
  if (bakedDecor) ctx.drawImage(bakedDecor, 0, 0, W, H)
  for (let row = r0; row < r1; row++) {
    for (let col = c0; col < c1; col++) {
      const tile = tiles[row][col]
      if (bakedDecor) {
        if (tile !== TILE_ID.FIRE && tile !== TILE_ID.CAMPFIRE && tile !== TILE_ID.HUT) {
          continue
        }
      } else if (
        tile !== TILE_ID.FOOD &&
        tile !== TILE_ID.FIRE &&
        tile !== TILE_ID.CAMPFIRE &&
        tile !== TILE_ID.HUT &&
        tile !== TILE_ID.MINERAL
      ) {
        continue
      }
      const px = col * TILE
      const py = row * TILE
      const seed = visualTileHash(col + ox, row + oy)

      if (!bakedDecor && tile === TILE_ID.FOOD) {
        drawFoodPatch(ctx, px, py, seed)
      }

      if (!bakedDecor && tile === TILE_ID.MINERAL) {
        drawMineralOutcrop(ctx, px, py, seed)
      }

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

      if (tile === TILE_ID.HUT && !ruinedTiles.has(`${col + ox},${row + oy}`)) {
        const BW = TILE
        const BH = TILE
        const bx = px
        const by = py
        const dp = world.day_progress ?? 0.5
        const nightFactor = world.is_day ? 0 : 1 - Math.abs(dp - 0.5) * 2
        const glowAlpha = 0.04 + 0.18 * nightFactor
        ctx.fillStyle = `rgba(255,215,110,${glowAlpha})`
        ctx.fillRect(bx - TILE / 2, by - TILE / 2, BW + TILE, BH + TILE)
        const hutVariant = (((col * 73856093) ^ (row * 19349663)) >>> 0) & 7
        const hutNight = Math.max(0, Math.min(3, Math.round(nightFactor * 3)))
        const hutSprite = getBuildingSprite('Hut', 1, 1, TILE, hutVariant, hutNight, 1)
        if (hutSprite) {
          ctx.drawImage(
            hutSprite,
            Math.round(bx - SPRITE_PAD),
            Math.round(by + BH + SPRITE_PAD_BOT - hutSprite.height),
          )
        }
        const now = Date.now()
        const smokeAlpha = !world.is_day && !overview ? 0.25 : 0
        if (smokeAlpha > 0) {
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
    if (hutPositions.length >= 3) {
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
      for (let col = c0; col < c1; col++) {
        const s = structure[row][col]
        if (s < 0.05) continue
        const t = tiles[row][col]
        if (t === 8) continue
        const px = col * TILE
        const py = row * TILE
        const alpha = Math.min(0.95, 0.4 + s * 0.55)
        if (TILE >= 8) {
          const cx2 = px + TILE / 2
          if (s >= 0.7) {
            ctx.fillStyle = `rgba(120,90,60,${0.6 + s * 0.3})`
            ctx.fillRect(px + 1, py + TILE * 0.5, TILE - 2, TILE * 0.5 - 1)
            ctx.fillStyle = `rgba(90,70,50,${0.7 + s * 0.25})`
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
            ctx.fillStyle = `rgba(100,65,30,${0.45 + s * 0.4})`
            ctx.fillRect(px + 2, py + TILE * 0.45, TILE - 4, TILE * 0.55 - 1)
            ctx.fillStyle = `rgba(80,50,20,${0.5 + s * 0.35})`
            ctx.beginPath()
            ctx.moveTo(cx2 - 1, py + 3)
            ctx.lineTo(px + TILE - 2, py + TILE * 0.47)
            ctx.lineTo(px + 2, py + TILE * 0.47)
            ctx.closePath()
            ctx.fill()
          } else {
            ctx.fillStyle = `rgba(130,95,45,${s * 2.5})`
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
    for (let row = r0; row < r1; row++) {
      const pr = path_trail[row]
      if (!pr) continue
      for (let col = c0; col < c1; col++) {
        const p = pr[col] ?? 0
        if (p < 0.55) continue
        ctx.fillStyle = `rgba(160,130,80,${Math.min(0.28, p * 0.3)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
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

  if (world.farms && world.farms.length > 0) {
    ctx.save()
    for (const farm of world.farms) {
      const localX = farm.x - ox
      const localY = farm.y - oy
      if (localX < c0 - 1 || localX > c1 || localY < r0 - 1 || localY > r1) continue
      const x = localX * TILE
      const y = localY * TILE
      const progress = farmProgress(farm, world.tick)
      const stage = farmStage(farm, world.tick)
      const cropColor = farmCropColor(farm.crop)

      ctx.fillStyle = '#3f2c21'
      ctx.fillRect(x, y, TILE, TILE)
      ctx.fillStyle = stage === 'fallow' ? '#6b4c32' : '#705335'
      ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2)
      ctx.fillStyle = stage === 'mature' ? '#b98b45' : '#4a3326'
      for (let row = 2; row < TILE - 1; row += 3) {
        ctx.fillRect(x + 1, y + row, TILE - 2, 1)
      }
      if (stage !== 'fallow') {
        ctx.fillStyle = cropColor
        const plantHeight = Math.max(1, Math.round(1 + progress * 4))
        const cropOffset = (farm.crop?.length ?? 0) % 2
        for (let plantX = 2 + cropOffset; plantX < TILE - 1; plantX += 3) {
          ctx.fillRect(x + plantX, y + TILE - plantHeight - 1, 1, plantHeight)
          if (plantHeight >= 3) ctx.fillRect(x + plantX + 1, y + TILE - plantHeight, 1, 1)
        }
      }
      if (stage === 'mature') {
        ctx.fillStyle = 'rgba(255, 232, 145, 0.9)'
        ctx.fillRect(x, y, TILE, 1)
        ctx.fillRect(x, y + TILE - 1, TILE, 1)
        ctx.fillRect(x, y, 1, TILE)
        ctx.fillRect(x + TILE - 1, y, 1, TILE)
      }
    }
    ctx.restore()
  }

  // Railways between each tribe's train stations, with trains shuttling
  // along them in the style of the tribe's age.
  const links = cachedRailLinks(world.buildings)
  if (links.length > 0) {
    const tiers = lineageEraTiers(world.lineage_eras)
    for (const link of links) {
      drawRail(
        ctx,
        (link.a.x - ox) * TILE,
        (link.a.y - oy) * TILE,
        (link.b.x - ox) * TILE,
        (link.b.y - oy) * TILE,
      )
    }
    for (const link of links) {
      drawTrain(
        ctx,
        (link.a.x - ox) * TILE,
        (link.a.y - oy) * TILE,
        (link.b.x - ox) * TILE,
        (link.b.y - oy) * TILE,
        trainProgress(link, world.tick),
        tiers.get(link.owner) ?? 5,
        t,
      )
    }
  }

  if (world.plantings && world.plantings.length >= 4) {
    const flat = world.plantings
    for (let i = 0; i + 3 < flat.length; i += 4) {
      const localX = flat[i]! - ox
      const localY = flat[i + 1]! - oy
      if (localX < c0 - 1 || localX > c1 || localY < r0 - 1 || localY > r1) continue
      drawPlanting(ctx, localX * TILE, localY * TILE, flat[i + 2]!, flat[i + 3]!)
    }
  }

  drawTradeNetwork2D(ctx, world, { c0, c1, r0, r1 }, t, 'roads')
  // Collected with the buildings, drawn above everything else on the map.
  const settlementLabels: SettlementLabel[] = []
  if (world.buildings && world.buildings.length > 0) {
    // Viewport-clip the building loop. Buildings are world-positioned;
    // c0/r0/c1/r1 are the tile-aligned visible window already computed
    // by the camera step. A generous 6-tile margin covers the tallest
    // building footprints without false-negative culling.
    const BLDG_MARGIN = 6
    const cxLo = c0 - BLDG_MARGIN
    const cxHi = c1 + BLDG_MARGIN
    const ryLo = r0 - BLDG_MARGIN
    const ryHi = r1 + BLDG_MARGIN
    const bdp = world.day_progress ?? 0.5
    const bNight = world.is_day ? 0 : Math.max(0, Math.min(1, 1 - Math.abs(bdp - 0.5) * 2))
    const buildingDetail = zoomDetailLevel(cameraZoom)
    const sorted = world.buildings
      .filter((b) => b.x - ox >= cxLo && b.x - ox <= cxHi && b.y - oy >= ryLo && b.y - oy <= ryHi)
      .sort(compareBuildingsByDepth)
    const tiers = lineageEraTiers(world.lineage_eras)
    for (const b of sorted) {
      if (typeof b.x !== 'number' || typeof b.y !== 'number') continue
      drawBuilding(
        ctx,
        {
          id: b.id,
          kind: b.kind,
          x: b.x,
          y: b.y,
          condition: b.condition,
          damage: b.damage,
          integrity: b.integrity,
          ruined: b.ruined,
          repairing: b.repairing,
          footprint: b.footprint,
          fw: b.fw,
          fh: b.fh,
          // The sim sends the owner as `lineage_id`; reading only
          // `owner_lineage` left every building in the Stone Age style.
          tier: tiers.get(b.owner_lineage ?? b.lineage_id ?? '') ?? 0,
          ruinAge:
            b.ruined && b.ruined_at_tick != null ? (world.tick - b.ruined_at_tick) / RUIN_CRUMBLE_TICKS : 0,
          state: b.kind === 'Spaceport' && padEmpty(b.id, world.tick) ? 'empty' : undefined,
        },
        ox,
        oy,
        TILE,
        bNight,
        buildingDetail,
      )
    }
    type Cluster = {
      cx: number
      cy: number
      count: number
      lineage: string
      name?: string
      tier?: number
      tierName?: string
      population?: number
    }
    const clusters: Cluster[] = []
    const CITY_RADIUS_SQ = 14 * 14
    if (world.settlements?.length) {
      for (const settlement of world.settlements) {
        const [cx, cy] = settlement.center
        if (cx < cxLo || cx > cxHi || cy < ryLo || cy > ryHi) continue
        clusters.push({
          cx,
          cy,
          count: settlement.building_count,
          lineage: settlement.lineage_id,
          name: settlement.name,
          tier: settlement.tier,
          tierName: settlement.tier_name,
          population: settlement.population,
        })
      }
    } else {
      // Legacy snapshots lack authoritative settlements. Retain the old
      // visual clustering as a compatibility fallback only.
      for (const b of world.buildings) {
        if (!getBuildingState(b).isOperational) continue
        const lid = (b as { lineage_id?: string }).lineage_id ?? ''
        if (!lid) continue
        const bx = b.x
        const by = b.y
        if (bx < cxLo || bx > cxHi || by < ryLo || by > ryHi) continue
        const existing = clusters.find(
          (c) => c.lineage === lid && (c.cx - bx) ** 2 + (c.cy - by) ** 2 < CITY_RADIUS_SQ,
        )
        if (existing) {
          existing.cx = (existing.cx * existing.count + bx) / (existing.count + 1)
          existing.cy = (existing.cy * existing.count + by) / (existing.count + 1)
          existing.count++
        } else {
          clusters.push({ cx: bx, cy: by, count: 1, lineage: lid })
        }
      }
    }
    const lineageNames = world.lineage_names ?? {}
    // A tribe on the brink is always named, at every zoom, whatever its size.
    const perilBy = new Map((world.tribes_in_peril ?? []).map((p) => [p.lineage_id, p]))
    for (const c of clusters) {
      const major = (c.tier ?? (c.count >= 12 ? 5 : 0)) >= 5
      const peril = perilBy.get(c.lineage)
      const showSettlementLabel =
        c.tier !== 0 && !(c.tier === undefined && c.count < 4) && (buildingDetail !== 'overview' || major)
      if (!showSettlementLabel && !peril) continue
      const name = c.name ?? lineageNames[c.lineage] ?? c.lineage.slice(0, 6)
      const title =
        c.tier !== undefined
          ? c.tier >= 5
            ? `${name.toUpperCase()} CITY`
            : `${name} ${c.tierName ?? 'settlement'}`
          : c.count >= 12
            ? `${name.toUpperCase()} CITY`
            : c.count >= 8
              ? `${name} town`
              : `${name} village`
      settlementLabels.push({
        x: (c.cx - ox) * TILE,
        y: (c.cy - oy) * TILE,
        title,
        sub: peril
          ? `⚠ ${remainingLine(peril.population)} · ${PERIL_HELP[peril.cause].reason}`
          : c.population !== undefined
            ? `${c.population} people · ${c.count} buildings`
            : `${c.count} bldgs`,
        major,
        priority:
          (peril ? 1_000_000 : 0) +
          (c.tier ?? (c.count >= 12 ? 5 : c.count >= 8 ? 4 : 2)) * 10000 +
          (c.population ?? c.count),
        color: major ? '#ffd28a' : (c.tier ?? 0) >= 4 || c.count >= 8 ? '#e5c89a' : '#c8b890',
        alert: !!peril,
      })
    }
  }

  drawTradeNetwork2D(ctx, world, { c0, c1, r0, r1 }, t, 'caravans')
  // Town names claim their place before people's name tags, so the two never
  // pile on each other; the names step aside for the towns.
  let placedSettlementLabels: PlacedLabel[] = []
  if (settlementLabels.length > 0 && !viewFlags.hideUI) {
    const scale = labelScale(cameraZoom)
    const measure = (text: string, kind: 'major' | 'minor' | 'sub') => {
      ctx.font = kind === 'sub' ? subFont(1) : titleFont(kind === 'major', 1)
      return ctx.measureText(text).width
    }
    placedSettlementLabels = placeSettlementLabels(settlementLabels, scale, measure, { w: W, h: H }, TILE * 2)
  }

  if (viewFlags.animals && animals.length > 0) {
    ctx.save()
    const atlasReady = ATLAS_CREATURE.complete && ATLAS_CREATURE.naturalWidth > 0
    if (_animalLastPos.size > Math.max(256, animals.length * 3)) {
      const visibleIds = new Set(animals.map((animal) => animal.id))
      for (const id of _animalLastPos.keys()) {
        if (!visibleIds.has(id)) _animalLastPos.delete(id)
      }
    }
    // Sleeping animals get a drifting 'z', drawn over every sprite.
    const sleepers: [number, number, number][] = []
    for (const animal of [...animals].sort((a, b) => a.y - b.y || a.id - b.id)) {
      if (animal.away) continue
      if (
        animal.x - ox < c0 - 3 ||
        animal.x - ox > c1 + 3 ||
        animal.y - oy < r0 - 3 ||
        animal.y - oy > r1 + 3
      )
        continue
      const motion = characterMotion(_animalLastPos.get(animal.id), animal.x, animal.y, t, 0)
      _animalLastPos.set(animal.id, motion)
      const small = animal.kind === 'fish' || animal.kind === 'bird' || animal.kind === 'rabbit'
      const flyer = animal.kind === 'dragon' || animal.kind === 'ufo'
      const size =
        MONSTER_SIZES[animal.kind] ??
        (animal.kind === 'chicken'
          ? 10
          : animal.kind === 'bear' || animal.kind === 'cow' || animal.kind === 'horse'
            ? 22
            : small
              ? 14
              : animal.kind === 'sheep'
                ? 18
                : 20)
      const moving = animal.kind === 'fish' || animal.kind === 'bird' || t - motion.movedAt < 320
      const speed =
        animal.kind === 'fish'
          ? 0.0028
          : animal.kind === 'bird'
            ? 0.005
            : animal.kind === 'wolf' || animal.kind === 'dog'
              ? 0.0042
              : 0.0036
      // Standing grazers dip slowly, as if eating, instead of freezing.
      const grazer = ['deer', 'sheep', 'cow', 'horse', 'rabbit'].includes(animal.kind)
      const amp =
        animal.kind === 'fish'
          ? 1.4
          : animal.kind === 'bird' || flyer
            ? 1.6
            : moving
              ? 0.55
              : grazer
                ? 0.45
                : 0
      const phase = (moving || !grazer ? t * speed : t * 0.0012) + animal.id * 0.7
      const yOff = Math.sin(phase) * amp
      const cx = (animal.x - ox) * TILE + TILE / 2
      const cy = (animal.y - oy) * TILE + TILE / 2 + yOff
      if (animal.kind !== 'fish' && animal.kind !== 'bird') {
        // Flyers cast a smaller, fainter shadow further below them.
        ctx.fillStyle = flyer ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.3)'
        ctx.beginPath()
        ctx.ellipse(
          cx,
          cy + size * (flyer ? 0.9 : 0.42),
          size * (flyer ? 0.24 : 0.32),
          size * (flyer ? 0.1 : 0.14),
          0,
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }
      if (animal.sleeping) sleepers.push([cx, cy - size * 0.55, animal.id])
      const flip = motion.flipped
      const step = moving ? Math.floor(t / 200 + animal.id) & 1 : 0
      if (drawPixelFauna(ctx, animal.kind, cx, cy, size, flip, step)) continue
      if (drawFaunaSprite(ctx, animal.kind, animal.id, cx, cy, size, flip)) continue
      if (animal.kind === 'wolf' || animal.kind === 'dog') {
        drawCanineSprite(
          ctx,
          cx,
          cy,
          size,
          animal.kind,
          flip,
          moving ? Math.floor(t / 220 + animal.id) & 1 : 0,
        )
      } else if (atlasReady) {
        // Tiny Creatures is a catalogue, not an animation strip. Keep each
        // animal on one deterministic variant so deer never morph into boar.
        const tile = pickAnimalTile(animal.kind, animal.id)
        const dx = Math.round(cx - size / 2)
        const dy = Math.round(cy - size / 2)
        if (!tile) {
          continue
        } else if (flip) {
          ctx.save()
          ctx.translate(dx + size, 0)
          ctx.scale(-1, 1)
          drawTile(ctx, ATLAS_CREATURE, tile, 0, dy, size)
          ctx.restore()
        } else {
          drawTile(ctx, ATLAS_CREATURE, tile, dx, dy, size)
        }
      } else {
        ctx.fillStyle = animal.kind === 'fish' ? '#6f9fb0' : '#8a6a4a'
        ctx.beginPath()
        ctx.ellipse(cx, cy, size * 0.32, size * 0.22, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    for (const [zx, zy, id] of sleepers) {
      const rise = ((t / 1800 + id * 0.37) % 1) * 6
      ctx.globalAlpha = 0.85 - rise / 10
      ctx.font = 'bold 7px monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#e8eef8'
      ctx.fillText('z', zx + rise * 0.6, zy - rise)
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }

  const lineageErasMap = normalizeLineageEras(world.lineage_eras)

  const isFocused = (org: WorldState['organisms'][0]) => {
    if (focus === 'all') return true
    if (focus.startsWith('lineage:')) return org.lineage_id === focus.slice(8)
    if (focus === 'sick') return org.infection > 0.15
    if (focus === 'hungry') return org.energy < 0.3
    if (focus === 'elders') return !!org.is_elder
    if (focus === 'builders')
      return !!(org.discoveries ?? []).some((d) =>
        ['shelter', 'fire', 'masonry', 'stone_tools', 'spear'].includes(d),
      )
    if (focus === 'thriving') return org.energy > 0.8 && org.hydration > 0.8
    return true
  }

  // Canvas clipping saves pixels, but does not skip sprite work or text
  // measurement. Cull before sorting and drawing off-screen people.
  const visibleOrganisms = organisms.filter(
    (org) =>
      org.alive &&
      org.x - ox >= c0 - 8 &&
      org.x - ox <= c1 + 8 &&
      org.y - oy >= r0 - 8 &&
      org.y - oy <= r1 + 8,
  )
  const boatsByRider = new Map(
    (world.vehicles ?? []).filter((v) => v.kind === 'boat' && v.rider_id).map((v) => [v.rider_id!, v]),
  )
  const characterDetail = zoomDetailLevel(cameraZoom)
  // Dense crowds contain many sprites on the same eight-pixel tile. Preserve
  // individual animation nearby, but cap overlapping atlas draws when the
  // viewport holds thousands of people. Selection and boats stay visible.
  const drawnOrganisms =
    visibleOrganisms.length > 6000
      ? selectCrowdSpriteRepresentatives(
          visibleOrganisms,
          characterDetail === 'overview' ? 1 : characterDetail === 'detail' ? 3 : 2,
          characterDetail === 'overview' ? Math.min(8, Math.max(2, Math.ceil(1 / cameraZoom))) : 1,
          selectedOrgId,
          new Set(boatsByRider.keys()),
        )
      : visibleOrganisms
  if (_orgLastPos.size > Math.max(512, drawnOrganisms.length * 3)) {
    const drawnIds = new Set(drawnOrganisms.map((organism) => organism.id))
    for (const id of _orgLastPos.keys()) {
      if (!drawnIds.has(id)) _orgLastPos.delete(id)
    }
  }
  for (const boat of world.vehicles ?? []) {
    if (
      boat.kind !== 'boat' ||
      boat.rider_id ||
      boat.x - ox < c0 - 3 ||
      boat.x - ox > c1 + 3 ||
      boat.y - oy < r0 - 3 ||
      boat.y - oy > r1 + 3
    )
      continue
    drawBoat(ctx, (boat.x - ox) * TILE + TILE / 2, (boat.y - oy) * TILE + TILE / 2, t, false)
  }
  for (const org of drawnOrganisms) orgMotion(org.id, org.x, org.y, t)
  const restingAtHome = (org: OrganismState) => {
    if (org.home_x == null || org.home_y == null) return false
    if (ruinedTiles.has(`${Math.floor(org.home_x)},${Math.floor(org.home_y)}`)) return false
    const motion = _orgLastPos.get(org.id)
    if (motion && t - motion.movedAt <= 120) return false
    const dx = org.x - org.home_x
    const dy = org.y - org.home_y
    return dx * dx + dy * dy < 2 && ((org.sleep_debt ?? 0) > 0.4 || org.energy < 0.1 || org.health < 0.15)
  }
  const crowded = visibleOrganisms.length > 400
  const labelIds =
    characterDetail !== 'overview' && viewFlags.names ? crowdLabelIds(drawnOrganisms, cameraZoom) : null
  const labelPlacer = new LabelPlacer()
  for (const p of placedSettlementLabels) labelPlacer.place(p.cx, p.cy + p.h / 2, p.w, p.h, true)
  // Where each praying tribe gathers, for the raised-hands glyphs.
  const prayerSpots = new Map((world.prayers ?? []).map((p) => [p.lineage_id, p] as const))
  // Batch every organism shadow into two paths (focused / dimmed) so the
  // whole population costs two fills instead of hundreds of separate
  // beginPath/ellipse/fill draw calls per frame.
  if (characterDetail !== 'overview' && !crowded) {
    const focusedShadows = new Path2D()
    const dimShadows = new Path2D()
    let any = false
    for (const org of drawnOrganisms) {
      if (!org.alive) continue
      if (restingAtHome(org)) continue
      const px = (org.x - ox) * TILE + TILE / 2
      const py = (org.y - oy) * TILE + TILE / 2
      const variant = orgVariant(org.id)
      const bodyR = variant.bodyRadius * (org.sex === 'male' ? 1.05 : 0.95)
      const spriteSize = Math.round(Math.max(19, bodyR * 3.8))
      const target = isFocused(org) ? focusedShadows : dimShadows
      const shadowCx = px + 1
      const shadowCy = py + spriteSize * 0.2
      const shadowRx = spriteSize * 0.27
      // moveTo to the ellipse's own start point first - ellipse()/arc() on a
      // Path2D that already has a current point implicitly draws a straight
      // line from there to the new arc's start. Without this, consecutive
      // organisms' shadows in this shared path get bridged by an invisible
      // edge (and the final fill's implicit close), which at low zoom reads
      // as huge black wedges connecting unrelated organisms across the map.
      target.moveTo(shadowCx + shadowRx, shadowCy)
      target.ellipse(shadowCx, shadowCy, shadowRx, spriteSize * 0.1, 0, 0, Math.PI * 2)
      any = true
    }
    if (any) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      ctx.globalAlpha = 0.12
      ctx.fill(dimShadows)
      ctx.globalAlpha = 1
      ctx.fill(focusedShadows)
    }
  }
  // Sample atlas readiness/source once and keep nearest-neighbor sampling for
  // the population pass instead of checking and toggling it for every sprite.
  const peopleAtlas = getPeopleAtlas()
  const populationSmoothing = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = false
  for (const org of drawnOrganisms.sort(compareCharacterDepth)) {
    if (!org.alive) continue
    if (restingAtHome(org)) continue
    const px = (org.x - ox) * TILE + TILE / 2
    const py = (org.y - oy) * TILE + TILE / 2
    const focused = isFocused(org)
    const isSelected = org.id === selectedOrgId
    const fullDetail = isSelected || characterDetail === 'detail'
    const standardDetail = isSelected || characterDetail !== 'overview'
    const variant = orgVariant(org.id)
    const bodyR = variant.bodyRadius * (org.sex === 'male' ? 1.05 : 0.95)
    const orgSex: 'male' | 'female' = org.sex === 'female' ? 'female' : 'male'
    const stage = resolveAgeStage(org)
    // The atlas owns age-specific proportions. Keeping one destination box
    // prevents infants and children from being scaled down twice.
    const spriteSize = Math.round(Math.max(19, bodyR * 3.8))
    const spriteTop = py - spriteSize * 0.78
    ctx.globalAlpha = focused ? 1 : 0.12

    const isSignaling = org.thought.startsWith('"') || org.thought.startsWith("'")
    if (standardDetail && (isSignaling || org.thought === 'sounding alarm')) {
      ctx.strokeStyle =
        org.thought.includes('!') || org.thought === 'sounding alarm'
          ? 'rgba(255,68,136,0.6)'
          : 'rgba(255,255,68,0.6)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(px, py, 10, 0, Math.PI * 2)
      ctx.stroke()
    } else if (standardDetail && (org.thought === 'challenging' || org.thought === 'challenging alone')) {
      ctx.strokeStyle = org.thought === 'challenging' ? 'rgba(255,34,0,0.85)' : 'rgba(204,68,34,0.7)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(px, py - 11)
      ctx.lineTo(px + 11, py)
      ctx.lineTo(px, py + 11)
      ctx.lineTo(px - 11, py)
      ctx.closePath()
      ctx.stroke()
    }

    if (standardDetail && org.infection > 0.15) {
      ctx.beginPath()
      ctx.arc(px, py, 8, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(187,255,68,${org.infection * 0.3})`
      ctx.fill()
    }

    if (isSelected) {
      ctx.save()
      ctx.beginPath()
      ctx.ellipse(px, py + 2, spriteSize * 0.42, spriteSize * 0.24, 0, 0, Math.PI * 2)
      // soft warm halo makes the selection readable over any biome
      ctx.strokeStyle = 'rgba(255, 210, 138, 0.35)'
      ctx.lineWidth = 3.5
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 2])
      ctx.lineDashOffset = -t * 0.01
      ctx.stroke()
      ctx.restore()
    }

    if (standardDetail && (!crowded || isSelected) && org.lineage_id) {
      ctx.strokeStyle = lineageColor(org.lineage_id)
      ctx.lineWidth = org.traits ? 0.75 + org.traits.resilience : 1
      ctx.beginPath()
      ctx.ellipse(px, py + 3, spriteSize * 0.34, spriteSize * 0.17, 0, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Keep simulation state visible as a restrained aura, not an opaque shape
    // painted over the character art.
    let bodyFill: string
    if (org.infection > 0.38) bodyFill = 'hsl(85,60%,48%)'
    else if ((org.fear_level ?? 0) > 0.72) bodyFill = 'hsl(10,70%,48%)'
    else if ((org.grief_ticks ?? 0) > 12) bodyFill = 'hsl(220,50%,50%)'
    else if ((org.joy_ticks ?? 0) > 30) bodyFill = 'hsl(45,80%,62%)'
    else if (org.energy < 0.12) bodyFill = 'hsl(38,55%,38%)'
    else bodyFill = THOUGHT_COLORS[org.thought] ?? '#cccccc'

    if (viewFlags.health) {
      const h = Math.max(0, Math.min(1, org.health))
      const r = Math.round(220 * (1 - h) + 80 * h)
      const g = Math.round(80 * (1 - h) + 200 * h)
      const b = Math.round(80 * (1 - h) + 100 * h)
      bodyFill = `rgb(${r},${g},${b})`
    } else if (viewFlags.age) {
      if (stage === 'elder') bodyFill = '#e9c87a'
      else if (stage === 'infant' || stage === 'child') bodyFill = '#8db5d6'
      else bodyFill = '#b8b8a8'
    }
    if (isSelected || viewFlags.health || viewFlags.age || (standardDetail && !crowded)) {
      ctx.save()
      ctx.globalAlpha *= viewFlags.health || viewFlags.age ? 0.3 : standardDetail ? 0.16 : 0.1
      ctx.fillStyle = bodyFill
      ctx.beginPath()
      ctx.arc(px, py, bodyR + 1.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    if (standardDetail && viewFlags.fear && (org.fear_level ?? 0) > 0.25) {
      const fa = Math.min(0.55, (org.fear_level ?? 0) * 0.8)
      ctx.beginPath()
      ctx.arc(px, py, bodyR + 4, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(220,70,70,${fa})`
      ctx.fill()
    }

    if (standardDetail && viewFlags.lineageDot && org.lineage_id) {
      ctx.fillStyle = lineageColor(org.lineage_id)
      ctx.beginPath()
      ctx.arc(px, py + bodyR * 0.4, 1.6, 0, Math.PI * 2)
      ctx.fill()
    }

    if (standardDetail && viewFlags.pregnancy && org.pregnant) {
      ctx.strokeStyle = 'rgba(255,220,120,0.9)'
      ctx.lineWidth = 1.3
      ctx.setLineDash([2, 2])
      ctx.beginPath()
      ctx.arc(px, py, bodyR + 2.5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }

    const motion = _orgLastPos.get(org.id)!
    const boat = boatsByRider.get(org.id)
    const frame = boat ? 0 : characterFrame(motion, t)
    const drew = drawPeopleTile(
      ctx,
      pickHumanSprite(orgSex, stage, frame, deterministicAppearanceIndex(org.id)),
      Math.round(px - spriteSize / 2),
      Math.round(spriteTop),
      spriteSize,
      motion.flipped,
      peopleAtlas,
    )
    if (!drew) {
      ctx.fillStyle = variant.hairColor
      ctx.beginPath()
      ctx.arc(px, py - bodyR * 0.7, bodyR * 0.55, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = variant.accent
      ctx.fillRect(Math.round(px - bodyR * 0.7), Math.round(py + bodyR * 0.15), bodyR * 1.4, 2)
    }

    if (boat) drawBoat(ctx, px, py, t, !boat.building && t - motion.movedAt <= 120, boat.building)
    if (standardDetail && !boat) {
      drawWorkActivity(
        ctx,
        workActivity(org.thought ?? '', t - motion.movedAt <= 120),
        px,
        py,
        motion.flipped,
        t,
        motion.phase,
      )
    }
    if (standardDetail) {
      const emote = emoteFor(org)
      if (emote) drawEmote(ctx, emote, px, py - bodyR * 2.4, t, motion.phase)
    }

    const era = lineageErasMap[org.lineage_id] ?? ''
    if (standardDetail && era && era !== 'pre-stone' && era !== 'stone') {
      ctx.save()
      ctx.fillStyle = ERA_STRIPE_COLOR[era] ?? 'rgba(255,255,255,0.0)'
      ctx.globalAlpha *= 0.75
      ctx.fillRect(Math.round(px - bodyR), Math.round(py + bodyR + 1), Math.round(bodyR * 2), 1)
      ctx.restore()
    }
    if (org.is_leader) {
      const crownX = Math.round(px - 4)
      const crownY = Math.round(spriteTop - 2)
      ctx.fillStyle = '#f2c84b'
      ctx.fillRect(crownX, crownY, 8, 2)
      ctx.fillRect(crownX, crownY - 2, 2, 2)
      ctx.fillRect(crownX + 3, crownY - 3, 2, 3)
      ctx.fillRect(crownX + 6, crownY - 2, 2, 2)
    }
    const specEmoji = SPECIALTY_EMOJI[org.specialty ?? ''] ?? ''
    if (fullDetail && specEmoji) {
      ctx.save()
      ctx.font = '7px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(specEmoji, px + bodyR + 1, py - bodyR * 0.4)
      ctx.restore()
    }
    if (standardDetail && org.diseases && org.diseases.length > 0) {
      ctx.save()
      ctx.font = '7px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('\u{1F912}', px - bodyR - 1, py - bodyR * 0.4)
      ctx.restore()
    }
    if (fullDetail && org.tools) {
      const toolEmoji = pickToolEmoji(org.tools)
      if (toolEmoji) {
        ctx.save()
        ctx.font = '8px serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(toolEmoji, px + bodyR + 4, py + bodyR * 0.6)
        ctx.restore()
      }
    }
    if (fullDetail && org.degrees && org.degrees.length > 0) {
      ctx.save()
      ctx.font = '7px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('\u{1F393}', px - bodyR - 4, py + bodyR * 0.6)
      ctx.restore()
    }

    if (standardDetail && org.carrying > 0) {
      ctx.fillStyle = org.carrying_type === 2 ? '#9a9a9a' : '#8b5e3c'
      ctx.fillRect(Math.round(px + spriteSize * 0.2), Math.round(py - 1), 5, 4)
    }

    const showVitals = isSelected || org.energy < 0.22 || org.hydration < 0.22 || org.health < 0.22
    if (showVitals) {
      const barW = Math.max(8, Math.round(spriteSize * 0.55))
      const bx = Math.round(px - barW / 2)
      const by = Math.round(spriteTop - 5)
      ctx.fillStyle = 'rgba(0,0,0,0.68)'
      ctx.fillRect(bx - 1, by - 1, barW + 2, 6)
      ctx.fillStyle = '#55dd55'
      ctx.fillRect(bx, by, Math.round(barW * Math.max(0, Math.min(1, org.energy))), 1)
      ctx.fillStyle = '#4499ff'
      ctx.fillRect(bx, by + 2, Math.round(barW * Math.max(0, Math.min(1, org.hydration))), 1)
      ctx.fillStyle = '#ff665c'
      ctx.fillRect(bx, by + 4, Math.round(barW * Math.max(0, Math.min(1, org.health))), 1)
    }

    // Someone born or spawned since the last full frame has no name yet;
    // drawing it printed the word "undefined".
    const showName =
      !!org.name && (isSelected || (standardDetail && viewFlags.names && (!labelIds || labelIds.has(org.id))))
    const showThought =
      (isSelected || (fullDetail && viewFlags.thoughts)) && org.thought && org.thought !== 'observing'
    const labelY = spriteTop - (showVitals ? 10 : 2)
    if (standardDetail && !viewFlags.hideUI) {
      const seed = org.id.charCodeAt(0) + org.id.charCodeAt(org.id.length - 1)
      const spot = prayerSpots.get(org.lineage_id)
      if (celebrating(org.lineage_id, org.x, org.y, t)) {
        drawCelebrationGlyph(ctx, px, spriteTop, t, seed)
      } else if (spot && seed % 2 === 0 && Math.hypot(org.x - spot.x, org.y - spot.y) <= 8) {
        drawPrayingGlyph(ctx, px, spriteTop, t, seed)
      }
    }
    // Names and thoughts that would sit on top of another label are left
    // out; the selected person's always shows.
    const nameShown =
      showName && labelPlacer.place(px, labelY, labelWidth(org.name, isSelected ? 10 : 9), 10, isSelected)
    const thoughtShown =
      showThought &&
      labelPlacer.place(px, labelY - (nameShown ? 10 : 0), labelWidth(org.thought ?? '', 8), 9, isSelected)

    if (nameShown) {
      ctx.font = isSelected ? 'bold 10px monospace' : '9px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      ctx.strokeText(org.name, px, labelY)
      ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(255,255,255,0.95)'
      ctx.fillText(org.name, px, labelY)
    }

    if (thoughtShown) {
      ctx.font = '8px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.lineWidth = 2.5
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      const thoughtY = labelY - (nameShown ? 10 : 0)
      ctx.strokeText(org.thought, px, thoughtY)
      ctx.fillStyle = isSelected ? 'rgba(180,220,255,1)' : 'rgba(180,220,255,0.9)'
      ctx.fillText(org.thought, px, thoughtY)
    }
  }
  ctx.imageSmoothingEnabled = populationSmoothing
  ctx.globalAlpha = 1

  // Player strategy beacons are a HUD overlay, so draw them after all
  // organisms and buildings. Otherwise a busy settlement can bury the
  // guidance label under hundreds of sprites.
  if (world.lineage_strategies) {
    const beacons = strategyBeaconPositions(
      world.lineage_strategies,
      world.tick,
      world.settlements,
      world.lineage_homes,
      organisms,
    )
    for (const { strategy, x: wx, y: wy } of beacons) {
      const centerX = (wx - ox) * TILE + TILE / 2
      const centerY = (wy - oy) * TILE + TILE / 2
      if (centerX < -32 || centerX > W + 32 || centerY < -32 || centerY > H + 32) continue

      const pulse = 22 + Math.sin(t * 0.003 + wx * 0.11 + wy * 0.07) * 4
      ctx.save()
      ctx.globalAlpha = 0.82
      ctx.strokeStyle = strategy.color
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(centerX, centerY, pulse, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 0.28
      ctx.beginPath()
      ctx.arc(centerX, centerY, pulse + 7, 0, Math.PI * 2)
      ctx.stroke()

      const label = `${strategy.symbol} ${strategy.label} · ${strategyTimeLabel(strategy.ticksRemaining)}`
      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const labelWidth = ctx.measureText(label).width + 12
      const labelY = centerY - pulse - 12
      ctx.globalAlpha = 0.92
      ctx.fillStyle = '#11181c'
      ctx.fillRect(centerX - labelWidth / 2, labelY - 8, labelWidth, 16)
      ctx.globalAlpha = 1
      ctx.strokeStyle = strategy.color
      ctx.lineWidth = 1
      ctx.strokeRect(centerX - labelWidth / 2, labelY - 8, labelWidth, 16)
      ctx.fillStyle = strategy.color
      ctx.fillText(label, centerX, labelY + 0.5)
      ctx.restore()
    }
  }

  for (const source of world.smog ?? []) {
    drawSmog(ctx, source, (source.x - ox) * TILE, (source.y - oy) * TILE, TILE, motionTime(t))
  }
  drawEraTraffic(ctx, world, ox, oy, W, H, cameraZoom, t)
  for (const battle of world.battles ?? []) {
    const age = battleAge(battle, world.tick)
    if (age === null) continue
    const [bx, by] = battle.location
    drawBattle(
      ctx,
      battle,
      (bx - ox) * TILE + TILE / 2,
      (by - oy) * TILE + TILE / 2,
      TILE,
      labelScale(cameraZoom),
      lineageColor(battle.attackers[0]),
      lineageColor(battle.defenders[0]),
      motionTime(t),
      age,
    )
  }
  for (const fest of world.festivals ?? []) {
    if (fest.x === undefined || fest.y === undefined) continue
    drawFestival(
      ctx,
      fest,
      (fest.x - ox) * TILE + TILE / 2,
      (fest.y - oy) * TILE + TILE / 2,
      TILE,
      world.tick,
      motionTime(t),
      lineageColor(fest.lineage_id),
    )
  }
  for (const ward of world.wards ?? []) {
    drawWard(
      ctx,
      ward,
      (ward.x - ox) * TILE + TILE / 2,
      (ward.y - oy) * TILE + TILE / 2,
      TILE,
      world.tick,
      motionTime(t),
    )
  }
  if (placedSettlementLabels.length > 0) drawSettlementLabels(ctx, placedSettlementLabels)
  updateWorldMoments(world, t)
  {
    const toPx = (x: number, y: number): [number, number] => [(x - ox) * TILE + TILE / 2, (y - oy) * TILE]
    drawBlessings(ctx, world, toPx, t)
    drawFireworks(ctx, toPx, t)
  }
  updatePrayerFeedback(world.prayers, world.faith, t)
  if (!viewFlags.hideUI) {
    drawPrayerFeedback(
      ctx,
      (x, y) => [(x - ox) * TILE + TILE / 2, (y - oy) * TILE],
      Math.max(1, 1.6 / Math.max(0.05, cameraZoom)),
      t,
    )
  }
  if (world.prayers && world.prayers.length > 0 && !viewFlags.hideUI) {
    // Keep bubbles readable when zoomed out: never smaller than ~21px on
    // screen, never larger than their pixel-art size when zoomed in.
    const bubbleScale = prayerBubbleScale(cameraZoom)
    // Bubbles that would overlap merge into one with a count, most urgent
    // on top, so a crowded valley doesn't turn into a pile of speech.
    const merged = mergePrayerBubbles(
      world.prayers.map((prayer) => ({
        prayer,
        x: (prayer.x - ox) * TILE + TILE / 2,
        y: (prayer.y - oy) * TILE,
        left: prayerTimeLeft(prayer, world.tick),
      })),
      16 * bubbleScale,
    )
    for (const { x, y, prayer, left, count } of merged) {
      if (x < -32 || x > W + 32 || y < -32 || y > H + 32) continue
      ctx.save()
      ctx.translate(Math.round(x), Math.round(y - 8))
      ctx.scale(bubbleScale, bubbleScale)
      drawPrayerBubble(ctx, 0, 0, prayer.kind, left, t, prayer.x + prayer.y, count)
      ctx.restore()
    }
  }

  if (viewFlags.fps) {
    fpsSamples.push(t)
    if (fpsSamples.length > 60) fpsSamples.shift()
    let fps = 0
    if (fpsSamples.length >= 2) {
      const span = fpsSamples[fpsSamples.length - 1] - fpsSamples[0]
      if (span > 0) fps = ((fpsSamples.length - 1) * 1000) / span
    }
    const text = `${fps.toFixed(0)} fps · ${organisms.filter((o) => o.alive).length} org`
    ctx.save()
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'right'
    const padX = 6
    const tw = ctx.measureText(text).width
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(W - tw - padX * 2 - 4, 4, tw + padX * 2, 16)
    ctx.fillStyle = '#aaffdd'
    ctx.fillText(text, W - padX - 4, 16)
    ctx.restore()
  }

  if (viewFlags.grid) {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= width; x++) {
      ctx.beginPath()
      ctx.moveTo(x * TILE, 0)
      ctx.lineTo(x * TILE, H)
      ctx.stroke()
    }
    for (let y = 0; y <= height; y++) {
      ctx.beginPath()
      ctx.moveTo(0, y * TILE)
      ctx.lineTo(W, y * TILE)
      ctx.stroke()
    }
  }
}
