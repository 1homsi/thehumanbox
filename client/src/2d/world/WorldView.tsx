import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Game,
  World,
  Entity,
  Transform,
  Sprite,
  Camera2D,
  useCamera,
  useEntity,
  useDynamicCanvas,
  useGestures,
} from 'cubeforge'
import type { AnimalState, OrganismState, WorldState } from '../../types'
import type { InterpRefs } from '../../simulation/useSimulation'
import { useUIStore, type ViewFlags } from '../../stores/store'
import { lineageColor, cbFireRgba } from '../../utils/constants'
import {
  ATLAS_TOWN,
  onAnyAtlasLoaded,
  drawPeopleTile,
  pickHumanSprite,
  SPRITE,
  ATLAS_CREATURE,
  drawTile,
  type AgeStage,
} from '../../utils/sprites'
import { drawBuilding } from './buildings2d'
import { normalizeLineageEras } from '../../utils/lineageEras'
import { useSceneStore } from '../../stores/scene'

const IS_MOBILE: boolean =
  typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 767px)').matches

// Low-end-laptop detection. Triggers on:
// - mobile (already-thin device)
// - < 6 logical cores (anything older than a mid-2020s laptop)
// - < 4 GB device memory (Chrome only; cheap Chromebooks, old machines)
// - explicit ?perf=low or localStorage thb-perf=low override
//
// When LOW_PERF is true we run the same cuts mobile gets — 30fps cap,
// skip the O(w×h) lake wave-line loop, and ratchet down the
// decoration density.
const LOW_PERF: boolean = (() => {
  if (typeof window === 'undefined') return false
  if (IS_MOBILE) return true
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('perf') === 'low') return true
    if (window.localStorage?.getItem('thb-perf') === 'low') return true
  } catch {
    /* ignore */
  }
  const cores = (navigator as Navigator & { hardwareConcurrency?: number }).hardwareConcurrency ?? 8
  if (cores < 6) return true
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  if (memory != null && memory < 4) return true
  return false
})()

function deriveAgeStage(age: number, isElder: boolean, declared?: string): AgeStage {
  if (declared === 'infant' || declared === 'child' || declared === 'teen' || declared === 'adult')
    return declared
  if (declared === 'elder') return 'adult'
  if (isElder) return 'adult'
  if (age < 220) return 'infant'
  if (age < 700) return 'child'
  if (age < 1400) return 'teen'
  return 'adult'
}
const _orgLastPos = new Map<string, { x: number; y: number; movedAt: number; phase: number }>()
function orgAnimPhase(id: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h % 800
}
function orgFrame(id: string, x: number, y: number, now: number): number {
  const last = _orgLastPos.get(id)
  let movedAt = last?.movedAt ?? 0
  let phase = last?.phase
  if (phase == null) phase = orgAnimPhase(id)
  if (!last || Math.abs(last.x - x) > 0.02 || Math.abs(last.y - y) > 0.02) {
    movedAt = now
    _orgLastPos.set(id, { x, y, movedAt, phase })
  }
  if (now - movedAt > 350) return 0
  return Math.floor(((now + phase) % 800) / 200)
}

interface OrgInterpCache {
  source: OrganismState[] | null
  prevSource: OrganismState[] | null
  frameId: number
  items: OrganismState[]
  prevById: Map<string, OrganismState>
}

interface AnimalInterpCache {
  source: AnimalState[] | null
  prevSource: AnimalState[] | null
  frameId: number
  items: AnimalState[]
  prevById: Map<number, AnimalState>
}

const ERA_CLOTHING_COLOR: Record<string, string> = {
  'pre-stone': '#6b5239',
  stone: '#7a6b55',
  bronze: '#a06a3c',
  iron: '#5e6e75',
  classical: '#c8a868',
  medieval: '#6a4030',
  renaissance: '#8a3848',
  industrial: '#3a2e22',
  modern: '#3a4a6a',
  information: '#3878b8',
}

const ERA_STRIPE_COLOR: Record<string, string> = {
  bronze: '#b07a2a',
  iron: '#7a7a7a',
  classical: '#d4a04a',
  medieval: '#5a4030',
  renaissance: '#c08850',
  industrial: '#3e2e22',
  modern: '#9aa0a8',
  information: '#7cc6ff',
}

function pickToolEmoji(tools: Record<string, number> | undefined): string {
  if (!tools) return ''
  if (tools.rifle || tools.musket) return '\u{1F52B}'
  if (tools.iron_sword) return '\u{2694}\u{FE0F}'
  if (tools.bronze_spear || tools.stone_spear) return '\u{1F3F9}'
  if (tools.bow || tools.crossbow) return '\u{1F3F9}'
  if (tools.computer) return '\u{1F4BB}'
  if (tools.book) return '\u{1F4D6}'
  if (tools.hammer || tools.saw) return '\u{1F528}'
  if (tools.plow) return '\u{1F69C}'
  return ''
}

const SPECIALTY_EMOJI: Record<string, string> = {
  farmer: '\u{1F33E}',
  smith: '\u{1F528}',
  hunter: '\u{1F3F9}',
  healer: '\u{2695}\u{FE0F}',
  scholar: '\u{1F4DC}',
  merchant: '\u{1F4B0}',
  soldier: '\u{2694}\u{FE0F}',
  builder: '\u{1F3D7}\u{FE0F}',
  priest: '\u{1F4FF}',
  artist: '\u{1F3A8}',
  engineer: '\u{2699}\u{FE0F}',
  sailor: '\u{26F5}',
  miner: '\u{26CF}\u{FE0F}',
  weaver: '\u{1F9F5}',
  baker: '\u{1F35E}',
  brewer: '\u{1F37A}',
  carpenter: '\u{1FA9C}',
  mason: '\u{1F9F1}',
  scribe: '\u{270D}\u{FE0F}',
  banker: '\u{1F3E6}',
  doctor: '\u{1F489}',
  teacher: '\u{1F4DA}',
  lawyer: '\u{2696}\u{FE0F}',
  officer: '\u{1F46E}',
  pilot: '\u{2708}\u{FE0F}',
  programmer: '\u{1F4BB}',
  journalist: '\u{1F4F0}',
  actor: '\u{1F3AD}',
  athlete: '\u{1F3C5}',
  politician: '\u{1F3DB}\u{FE0F}',
}
import { TILE, TILE_RGB, BIOME_RGBA, THOUGHT_COLORS } from '../../world/palette'
import { orgVariant } from '../../world/org-variant'
import { drawTrees, drawClouds, drawNaturalDecor, scratchA, scratchB } from './decorations'

const fpsSamples: number[] = []

let _imgBuf: ImageData | null = null
let _baseCanvas: HTMLCanvasElement | null = null
let _baseKey: {
  width: number
  height: number
  origin_x: number
  origin_y: number
  tiles: number[][]
  biomes?: number[][]
  depth_map?: number[][]
  season?: string
} | null = null

onAnyAtlasLoaded(() => {
  _baseKey = null
})
function getReuseImgData(w: number, h: number): ImageData {
  if (!_imgBuf || _imgBuf.width !== w || _imgBuf.height !== h) {
    _imgBuf = new ImageData(w, h)
  }
  return _imgBuf
}

function baseLayerMatches(
  key: typeof _baseKey,
  width: number,
  height: number,
  origin_x: number,
  origin_y: number,
  tiles: number[][],
  biomes?: number[][],
  depth_map?: number[][],
  season?: string,
) {
  return (
    !!key &&
    key.width === width &&
    key.height === height &&
    key.origin_x === origin_x &&
    key.origin_y === origin_y &&
    key.tiles === tiles &&
    key.biomes === biomes &&
    key.depth_map === depth_map &&
    key.season === season
  )
}

function vnHash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = ((h ^ (h >>> 13)) * 1274126177) | 0
  return ((h >>> 0) & 0xffff) / 0xffff
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = vnHash(xi, yi)
  const b = vnHash(xi + 1, yi)
  const c = vnHash(xi, yi + 1)
  const d = vnHash(xi + 1, yi + 1)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

const SEASON_LAND_TINT: Record<string, { rgb: [number, number, number]; w: number }> = {
  abundance: { rgb: [58, 138, 66], w: 0.22 },
  recovery: { rgb: [92, 150, 64], w: 0.3 },
  decline: { rgb: [150, 118, 44], w: 0.42 },
  scarcity: { rgb: [128, 102, 56], w: 0.52 },
}

const BEACH_RGB: [number, number, number] = [196, 176, 122]
const SHALLOW_RGB: [number, number, number] = [116, 198, 208]

function getBaseLayerCanvas(world: WorldState): HTMLCanvasElement | null {
  const { width, height, tiles, biomes } = world.grid
  if (!tiles || tiles.length < height) return null
  const depth_map = world.grid.depth_map as number[][] | undefined
  const origin_x = world.grid.origin_x ?? 0
  const origin_y = world.grid.origin_y ?? 0
  const W = width * TILE
  const H = height * TILE

  const season = world.season
  if (
    _baseCanvas &&
    baseLayerMatches(_baseKey, width, height, origin_x, origin_y, tiles, biomes, depth_map, season)
  ) {
    return _baseCanvas
  }

  const canvas =
    _baseCanvas && _baseCanvas.width === W && _baseCanvas.height === H
      ? _baseCanvas
      : document.createElement('canvas')
  canvas.width = W
  canvas.height = H

  const imgData = getReuseImgData(W, H)
  const d = imgData.data
  const varAmtFor = (tid: number): number => {
    if (tid === 2 || tid === 9) return 4
    if (tid === 1 || tid === 3) return 13
    if (tid === 5) return 17
    if (tid === 6) return 19
    if (tid === 12) return 7
    if (tid === 13) return 15
    return 9
  }
  const landTint = SEASON_LAND_TINT[season]
  for (let row = 0; row < height; row++) {
    const tileRow = tiles[row]
    const biomeRow = biomes?.[row]
    const depthRow = depth_map?.[row]
    const tileRowPrev = row > 0 ? tiles[row - 1] : undefined
    const tileRowNext = row + 1 < height ? tiles[row + 1] : undefined
    for (let col = 0; col < width; col++) {
      const tid = tileRow?.[col] ?? 0
      const rgb = TILE_RGB[tid] ?? TILE_RGB[0]
      let [r, g, b] = rgb

      const isWater = tid === 2 || tid === 9
      const wN = tileRowPrev?.[col]
      const wS = tileRowNext?.[col]
      const wW = col > 0 ? tileRow?.[col - 1] : undefined
      const wE = tileRow?.[col + 1]
      const touchesWater =
        wN === 2 || wN === 9 || wS === 2 || wS === 9 || wW === 2 || wW === 9 || wE === 2 || wE === 9
      const touchesLand =
        (wN !== undefined && wN !== 2 && wN !== 9) ||
        (wS !== undefined && wS !== 2 && wS !== 9) ||
        (wW !== undefined && wW !== 2 && wW !== 9) ||
        (wE !== undefined && wE !== 2 && wE !== 9)

      if (tid === 2 && depthRow) {
        const dv = depthRow[col]
        if (dv < 255) {
          const t_ = 1 - dv / 200
          r = (100 - t_ * 28) | 0
          g = (170 - t_ * 42) | 0
          b = (220 - t_ * 30) | 0
        }
      }

      if (isWater && touchesLand) {
        r = (r * 0.68 + SHALLOW_RGB[0] * 0.32) | 0
        g = (g * 0.68 + SHALLOW_RGB[1] * 0.32) | 0
        b = (b * 0.68 + SHALLOW_RGB[2] * 0.32) | 0
      }

      if (tid !== 2 && tid !== 5 && tid !== 12) {
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

      let shading = 0
      if (!isWater) {
        const grassy = tid === 1 || tid === 3 || tid === 6 || tid === 13
        if (grassy && landTint) {
          const macro = valueNoise(col / 42, row / 42) * 0.65 + valueNoise(col / 13 + 7, row / 13 + 7) * 0.35
          let w = landTint.w * (0.55 + macro * 0.9)
          if (w > 0.85) w = 0.85
          const iw = 1 - w
          r = (r * iw + landTint.rgb[0] * w) | 0
          g = (g * iw + landTint.rgb[1] * w) | 0
          b = (b * iw + landTint.rgb[2] * w) | 0
          shading += ((macro - 0.5) * 26) | 0
        }
        if (touchesWater) {
          if (tid === 1 || tid === 3 || tid === 6 || tid === 13) {
            r = (r * 0.55 + BEACH_RGB[0] * 0.45) | 0
            g = (g * 0.55 + BEACH_RGB[1] * 0.45) | 0
            b = (b * 0.55 + BEACH_RGB[2] * 0.45) | 0
          }
          shading += 8
        }
      }

      const varAmt = varAmtFor(tid)
      const bx = col * TILE,
        by = row * TILE
      for (let ty = 0; ty < TILE; ty++) {
        const gy = by + ty
        let pi = (gy * W + bx) * 4
        for (let tx = 0; tx < TILE; tx++, pi += 4) {
          const gx = bx + tx
          let h = (gx * 374761393 + gy * 668265263) | 0
          h = ((h ^ (h >>> 13)) * 1274126177) | 0
          const k = ((((h >>> 0) & 0xff) - 128) * varAmt) >> 7
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
  }

  const baseCtx = canvas.getContext('2d')!
  baseCtx.putImageData(imgData, 0, 0)
  if (biomes && ATLAS_TOWN.complete) {
    drawTrees(baseCtx, width, height, tiles, biomes)
  }
  if (biomes) {
    drawNaturalDecor(baseCtx, width, height, tiles, biomes)
  }
  _baseCanvas = canvas
  _baseKey = { width, height, origin_x, origin_y, tiles, biomes, depth_map, season }
  return canvas
}

function drawWorldOnCanvas(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  selectedOrgId: string | null,
  overlay: string | null,
  focus: string,
  viewFlags: ViewFlags,
  bounds?: { c0: number; c1: number; r0: number; r1: number },
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

  const base = getBaseLayerCanvas(world)
  if (!base) return
  ctx.drawImage(base, 0, 0)

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
      if (world.season === 'scarcity' && !isStorm) {
        ctx.fillStyle = `rgba(240,246,255,${0.35 + wi * 0.3})`
        const flakes = Math.round(90 * (0.4 + wi * 0.6))
        for (let i = 0; i < flakes; i++) {
          const drift = Math.sin(t * 0.0012 + i * 1.7) * 6 + wx * 10
          const sxp = (i * 137 + t * 0.12 + drift) % W
          const syp = (i * 251 + t * 0.25) % H
          const sz = 1 + ((i * 7) % 2)
          ctx.fillRect(sxp, syp, sz, sz)
        }
      } else {
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

  if (!world.is_day && world.cosmos) {
    const illum = world.cosmos.moon_illum ?? 0.7
    const radius = 14 + illum * 8
    const cx = W - 50
    const cy = 50
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(180,200,240,${0.05 + illum * 0.12})`
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(240,244,255,${0.2 + illum * 0.65})`
    ctx.fill()
    const phase = world.cosmos.moon_phase
    if (phase !== 'full_moon' && phase !== 'new_moon') {
      const dx = phase.startsWith('waxing') ? -radius * (1 - illum) : radius * (1 - illum)
      ctx.beginPath()
      ctx.arc(cx + dx, cy, radius * 1.05, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(20,28,70,0.95)'
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.restore()
  }

  if (!world.is_day || (world.day_progress ?? 0) > 0.05) {
    const tt = t * 0.001
    ctx.fillStyle = world.is_day ? 'rgba(255,255,255,0.55)' : 'rgba(180,200,240,0.30)'
    // Align to even boundaries so the star-on-water pattern stays
    // stable as the camera pans (stride-2 sampling must visit the
    // same cells from frame to frame).
    for (let row = r0 & ~1; row < r1; row += 2) {
      const drow = world.grid.depth_map?.[row]
      if (!drow) continue
      for (let col = c0 & ~1; col < c1; col += 2) {
        if ((drow[col] ?? 255) >= 254) continue
        let h = (col * 374761393 + row * 668265263) | 0
        h = ((h ^ (h >>> 13)) * 1274126177) >>> 0
        const phase = ((h & 0xff) / 255) * Math.PI * 2
        const blink = Math.sin(tt * 1.7 + phase) + Math.sin(tt * 0.9 + phase * 1.3)
        if (blink < 1.3) continue
        const px = col * TILE + ((h >>> 8) & 3)
        const py = row * TILE + ((h >>> 10) & 3)
        ctx.fillRect(px, py, 2, 1)
      }
    }
  }

  {
    const dm = world.grid.depth_map
    if (dm) {
      const foamT = t * 0.0014
      const fr0 = Math.max(1, r0)
      const fr1 = Math.min(height - 1, r1)
      const fc0 = Math.max(1, c0)
      const fc1 = Math.min(width - 1, c1)
      for (let pass = 0; pass < 2; pass++) {
        ctx.fillStyle = pass === 0 ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.55)'
        for (let row = fr0; row < fr1; row++) {
          const drow = dm[row]
          if (!drow) continue
          for (let col = fc0; col < fc1; col++) {
            if ((drow[col] ?? 255) >= 254) continue
            const n = dm[row - 1]?.[col] ?? 255
            const s = dm[row + 1]?.[col] ?? 255
            const e = drow[col + 1] ?? 255
            const w = drow[col - 1] ?? 255
            if (n < 254 && s < 254 && e < 254 && w < 254) continue
            if (pass === 1) {
              let h = (col * 374761393 + row * 668265263) | 0
              h = ((h ^ (h >>> 13)) * 1274126177) >>> 0
              const pulse = Math.sin(foamT + ((h & 0xff) / 255) * Math.PI * 2)
              if (pulse < 0.25) continue
            }
            const px = col * TILE
            const py = row * TILE
            const th = pass === 1 ? 2 : 1
            if (n >= 254) ctx.fillRect(px, py, TILE, th)
            if (s >= 254) ctx.fillRect(px, py + TILE - th, TILE, th)
            if (e >= 254) ctx.fillRect(px + TILE - th, py, th, TILE)
            if (w >= 254) ctx.fillRect(px, py, th, TILE)
          }
        }
      }
    }
  }

  // Lake shimmer - animated sparkle on shallow water tiles (depth 180-253)
  {
    const dm = world.grid.depth_map
    if (dm) {
      const shimmerT = t * 0.0015
      ctx.fillStyle = 'rgba(180,230,255,0.28)'
      for (let row = r0; row < r1; row++) {
        const dr = dm[row]
        if (!dr) continue
        for (let col = c0; col < c1; col++) {
          const d = dr[col] ?? 255
          if (d < 180 || d >= 254) continue
          let h = (col * 374761393 + row * 668265263 + ((shimmerT * 100) | 0)) | 0
          h = ((h ^ (h >>> 13)) * 1274126177) >>> 0
          const pulse = Math.sin(shimmerT * 2.1 + ((h & 0xff) / 255) * Math.PI * 2)
          if (pulse < 0.6) continue
          ctx.fillRect(col * TILE + ((h >>> 8) & 3), row * TILE + ((h >>> 10) & 3), 2, 1)
        }
      }
      // Subtle wave lines on lakes - skip on mobile (O(w×h) inner loop)
      ctx.save()
      ctx.strokeStyle = 'rgba(140,200,240,0.18)'
      ctx.lineWidth = 0.8
      const skipWaves = LOW_PERF
      for (let row = 1; row < height - 1 && !skipWaves; row++) {
        const dr = dm[row]
        if (!dr) continue
        let waveStart = -1
        for (let col = 0; col <= width; col++) {
          const d = col < width ? (dr[col] ?? 255) : 255
          const shallow = d >= 180 && d < 254
          if (shallow && waveStart < 0) waveStart = col
          if (!shallow && waveStart >= 0) {
            const wlen = col - waveStart
            if (wlen >= 3) {
              const wy = row * TILE + TILE / 2 + Math.sin(shimmerT + waveStart * 0.3) * 0.8
              ctx.beginPath()
              ctx.moveTo(waveStart * TILE + 2, wy)
              for (let wx = waveStart + 1; wx < col; wx++) {
                ctx.lineTo(wx * TILE + TILE / 2, wy + Math.sin(shimmerT * 1.4 + wx * 0.5) * 1.0)
              }
              ctx.stroke()
            }
            waveStart = -1
          }
        }
      }
      ctx.restore()
    }
  }

  for (let row = r0; row < r1; row++) {
    for (let col = c0; col < c1; col++) {
      const t = tiles[row][col]
      if (t !== 4 && t !== 7 && t !== 8) continue
      const px = col * TILE
      const py = row * TILE

      if (t === 4 && fire_intensity) {
        const fi = fire_intensity[row][col]
        ctx.fillStyle = cbFireRgba(255, 120, 0, fi * 0.55)
        ctx.fillRect(px, py, TILE, TILE)
      }

      if (t === 7 && fire_intensity) {
        const fi = fire_intensity[row][col]
        ctx.fillStyle = cbFireRgba(255, 200, 80, fi * 0.7)
        ctx.fillRect(px, py, TILE, TILE)
        if (!world.is_day) {
          const fcx = px + TILE / 2
          const fcy = py + TILE / 2
          const flicker = 0.85 + Math.sin(Date.now() * 0.011 + col * 3.1 + row * 1.7) * 0.15
          const lr = TILE * 5.5 * flicker
          const grad = ctx.createRadialGradient(fcx, fcy, TILE * 0.4, fcx, fcy, lr)
          grad.addColorStop(0, `rgba(255,190,90,${0.5 * fi})`)
          grad.addColorStop(0.45, `rgba(255,150,50,${0.22 * fi})`)
          grad.addColorStop(1, 'rgba(255,120,30,0)')
          ctx.fillStyle = grad
          ctx.fillRect(fcx - lr, fcy - lr, lr * 2, lr * 2)
        } else {
          ctx.fillStyle = cbFireRgba(255, 160, 40, fi * 0.12)
          ctx.fillRect(px - TILE * 2, py - TILE * 2, TILE * 5, TILE * 5)
        }
        if (TILE >= 8) {
          const cx2 = px + TILE / 2
          ctx.fillStyle = cbFireRgba(255, 80, 0, fi * 0.6)
          ctx.beginPath()
          ctx.arc(cx2, py + TILE * 0.4, TILE * 0.18, 0, Math.PI * 2)
          ctx.fill()
          // Market stall awning adjacent to campfire
          const stallAngle = (((col + row) * 137) % 360) * (Math.PI / 180)
          const sd = TILE * 1.6
          const sx = px + TILE / 2 + Math.cos(stallAngle) * sd
          const sy = py + TILE / 2 + Math.sin(stallAngle) * sd
          ctx.fillStyle = 'rgba(200,120,30,0.70)'
          ctx.fillRect(sx - TILE * 0.6, sy - TILE * 0.3, TILE * 1.2, TILE * 0.6)
          ctx.fillStyle = 'rgba(90,50,15,0.70)'
          ctx.fillRect(sx - TILE * 0.5, sy, TILE * 0.15, TILE * 0.5)
          ctx.fillRect(sx + TILE * 0.35, sy, TILE * 0.15, TILE * 0.5)
        }
      }

      if (t === 8) {
        const BW = TILE * 2
        const BH = TILE * 2
        const bx = px - TILE / 2
        const by = py - TILE / 2
        const dp = world.day_progress ?? 0.5
        const nightFactor = world.is_day ? 0 : 1 - Math.abs(dp - 0.5) * 2
        const glowAlpha = 0.1 + (0.42 - 0.1) * nightFactor
        ctx.fillStyle = `rgba(255,215,110,${glowAlpha})`
        ctx.fillRect(bx - TILE, by - TILE, BW + TILE * 2, BH + TILE * 2)
        ctx.fillStyle = '#5a2e08'
        ctx.beginPath()
        ctx.moveTo(bx + BW / 2, by)
        ctx.lineTo(bx + BW, by + BH * 0.44)
        ctx.lineTo(bx, by + BH * 0.44)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#b89060'
        ctx.fillRect(bx + 1, by + BH * 0.44, BW - 2, BH * 0.56 - 1)
        ctx.fillStyle = '#2a1000'
        ctx.fillRect(bx + BW / 2 - 2, by + BH * 0.6, 4, BH * 0.36 - 1)
        const now = Date.now()
        const windowAlpha = world.is_day ? 0.6 : Math.sin(now * 0.002) * 0.1 + 0.7
        ctx.fillStyle = `rgba(255,230,140,${windowAlpha})`
        ctx.fillRect(bx + 3, by + BH * 0.5, 3, 3)
        ctx.fillRect(bx + BW - 6, by + BH * 0.5, 3, 3)
        const smokeAlpha = !world.is_day ? 0.25 : 0
        if (smokeAlpha > 0) {
          for (let s = 0; s < 3; s++) {
            const phase = (now * 0.0008 + s * 0.4) % 1
            ctx.fillStyle = `rgba(180,180,185,${smokeAlpha * (1 - phase)})`
            ctx.beginPath()
            ctx.ellipse(
              bx + BW / 2 + Math.sin(phase * Math.PI) * 2,
              by - phase * 12,
              3 + phase * 4,
              2 + phase * 2,
              0,
              0,
              Math.PI * 2,
            )
            ctx.fill()
          }
        }
      }
    }
  }

  // Settlement markers: draw a subtle ring around clusters of 3+ huts
  {
    const hutPositions: [number, number][] = []
    for (let row = r0; row < r1; row++) {
      const tr = tiles[row]
      if (!tr) continue
      for (let col = c0; col < c1; col++) {
        if (tr[col] === 8) hutPositions.push([col, row])
      }
    }
    if (hutPositions.length >= 3) {
      const usedInCluster = new Set<number>()
      for (let i = 0; i < hutPositions.length; i++) {
        if (usedInCluster.has(i)) continue
        const [hx, hy] = hutPositions[i]
        const cluster = [i]
        for (let j = i + 1; j < hutPositions.length; j++) {
          const [jx, jy] = hutPositions[j]
          const d2 = (hx - jx) ** 2 + (hy - jy) ** 2
          if (d2 < 64) {
            cluster.push(j)
            usedInCluster.add(j)
          }
        }
        usedInCluster.add(i)
        if (cluster.length < 3) continue
        const cx2 = cluster.reduce((s, k) => s + hutPositions[k][0], 0) / cluster.length
        const cy2 = cluster.reduce((s, k) => s + hutPositions[k][1], 0) / cluster.length
        const r2 = Math.sqrt(cluster.length) * TILE * 2.2 + TILE * 3
        const px2 = cx2 * TILE + TILE / 2
        const py2 = cy2 * TILE + TILE / 2
        ctx.save()
        // Settlement ring
        ctx.strokeStyle = `rgba(200,170,80,${Math.min(0.45, 0.2 + cluster.length * 0.04)})`
        ctx.lineWidth = 1.2
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.arc(px2, py2, r2, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
        // Town hall icon for large settlements (5+ huts)
        if (cluster.length >= 5) {
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

  const liveOrgs = organisms.filter((o) => o.alive && o.lineage_id)
  if (viewFlags.territory && liveOrgs.length > 0) {
    const BLOCK = 4
    const MAX_DIST_SQ = 40 * 40
    const bw = Math.ceil(width / BLOCK)
    const bh = Math.ceil(height / BLOCK)

    // Dedupe by lineage so two orgs of the same lineage share one
    // palette entry (string ops happen once per lineage, not per org).
    type Lin = { fill: string; border: string; lid: string }
    const linByLid = new Map<string, number>()
    const lineages: Lin[] = []
    // Parallel SoA arrays for the nearest-org search - cache friendlier
    // than walking an array of records, and lets us skip object lookups
    // inside the hot inner loop.
    const orgTx = new Float32Array(liveOrgs.length)
    const orgTy = new Float32Array(liveOrgs.length)
    const orgLin = new Int32Array(liveOrgs.length)
    for (let i = 0; i < liveOrgs.length; i++) {
      const o = liveOrgs[i]
      orgTx[i] = o.x - ox
      orgTy[i] = o.y - oy
      let idx = linByLid.get(o.lineage_id)
      if (idx === undefined) {
        const hsl = lineageColor(o.lineage_id)
        const dark = hsl
          .replace(/(\d+)%\)$/, (_, l) => `${Math.max(15, Number(l) - 30)}%, 0.85)`)
          .replace('hsl(', 'hsla(')
        const fill = hsl.replace('hsl(', 'hsla(').replace(')', ', 0.25)')
        idx = lineages.length
        lineages.push({ fill, border: dark, lid: o.lineage_id })
        linByLid.set(o.lineage_id, idx)
      }
      orgLin[i] = idx
    }

    // Flat Int32Array for owner-lineage indices: 1 alloc instead of 3×
    // nested arrays of strings. -1 = unowned, otherwise index into `lineages`.
    const owner = new Int32Array(bw * bh)
    owner.fill(-1)
    const orgN = liveOrgs.length
    for (let by = 0; by < bh; by++) {
      const rowOffset = by * bw
      const cy2 = by * BLOCK + BLOCK * 0.5
      const cy2i = Math.floor(cy2)
      const tilesRow = tiles[cy2i]
      for (let bx = 0; bx < bw; bx++) {
        const cx2 = bx * BLOCK + BLOCK * 0.5
        if (tilesRow?.[Math.floor(cx2)] === 2) continue
        let bestIdx = -1,
          bestDist = MAX_DIST_SQ
        for (let i = 0; i < orgN; i++) {
          const dx = orgTx[i] - cx2
          const dy = orgTy[i] - cy2
          const d = dx * dx + dy * dy
          if (d < bestDist) {
            bestDist = d
            bestIdx = orgLin[i]
          }
        }
        if (bestIdx >= 0) owner[rowOffset + bx] = bestIdx
      }
    }

    // Fill pass: batch contiguous spans of identical lineage on the same
    // row into a single fillRect (avoids per-cell state-change cost).
    for (let by = 0; by < bh; by++) {
      const rowOffset = by * bw
      let bx = 0
      while (bx < bw) {
        const idx = owner[rowOffset + bx]
        if (idx < 0) {
          bx++
          continue
        }
        let ex = bx + 1
        while (ex < bw && owner[rowOffset + ex] === idx) ex++
        ctx.fillStyle = lineages[idx].fill
        ctx.fillRect(bx * BLOCK * TILE, by * BLOCK * TILE, (ex - bx) * BLOCK * TILE, BLOCK * TILE)
        bx = ex
      }
    }

    const BW = 2
    for (let by = 0; by < bh; by++) {
      const rowOffset = by * bw
      const topOffset = by > 0 ? rowOffset - bw : -1
      const bottomOffset = by < bh - 1 ? rowOffset + bw : -1
      for (let bx = 0; bx < bw; bx++) {
        const idx = owner[rowOffset + bx]
        if (idx < 0) continue
        const top = topOffset >= 0 ? owner[topOffset + bx] : -1
        const bottom = bottomOffset >= 0 ? owner[bottomOffset + bx] : -1
        const left = bx > 0 ? owner[rowOffset + bx - 1] : -1
        const right = bx < bw - 1 ? owner[rowOffset + bx + 1] : -1
        if (top !== idx || bottom !== idx || left !== idx || right !== idx) {
          ctx.fillStyle = lineages[idx].border
          const px = bx * BLOCK * TILE,
            py = by * BLOCK * TILE
          const sz = BLOCK * TILE
          if (top !== idx) ctx.fillRect(px, py, sz, BW)
          if (bottom !== idx) ctx.fillRect(px, py + sz - BW, sz, BW)
          if (left !== idx) ctx.fillRect(px, py, BW, sz)
          if (right !== idx) ctx.fillRect(px + sz - BW, py, BW, sz)
        }
      }
    }
  }

  {
    const phase = world.day_progress
    const smoothstep = (t: number) => t * t * (3 - 2 * t)

    let darkness = 0
    if (phase >= 0.55 && phase < 0.8) {
      darkness = 0.85 * smoothstep((phase - 0.55) / 0.25)
    } else if (phase >= 0.8 && phase < 0.95) {
      darkness = 0.85
    } else if (phase >= 0.95) {
      darkness = 0.85 * (1 - smoothstep((phase - 0.95) / 0.1))
    } else if (phase < 0.05) {
      darkness = 0.85 * (1 - smoothstep((phase + 0.05) / 0.1))
    }

    const gauss = (d: number, sigma: number) => Math.exp(-(d * d) / (2 * sigma * sigma))

    const sunsetDist = Math.abs(phase - 0.67)
    let dawnDist = Math.abs(phase - 0.0)
    dawnDist = Math.min(dawnDist, 1 - dawnDist)
    const warm = Math.max(gauss(sunsetDist, 0.06), gauss(dawnDist, 0.04))

    if (warm > 0.01) {
      ctx.fillStyle = `rgba(255, 100, 40, ${warm * 0.2})`
      ctx.fillRect(0, 0, W, H)
    }
    if (darkness > 0) {
      ctx.fillStyle = `rgba(0, 0, 40, ${darkness * 0.55})`
      ctx.fillRect(0, 0, W, H)
    }
  }

  const weather = world.weather
  drawClouds(ctx, W, H, weather, t)
  if (weather && weather.kind !== 'clear') {
    const isStorm = weather.kind === 'storm'
    const tintAlpha = weather.intensity * (isStorm ? 0.38 : 0.22)
    ctx.fillStyle = isStorm ? `rgba(18,28,60,${tintAlpha})` : `rgba(45,90,170,${tintAlpha})`
    ctx.fillRect(0, 0, W, H)
    const streakSpacing = isStorm ? 5 : 9
    const streakOpacity = weather.intensity * (isStorm ? 0.75 : 0.5)
    const animOffset = (t / (isStorm ? 40 : 65)) % streakSpacing
    ctx.save()
    ctx.strokeStyle = `rgba(170,210,255,${streakOpacity})`
    ctx.lineWidth = isStorm ? 1.2 : 0.7
    for (let sx = -H * 0.5 - streakSpacing + animOffset; sx < W + H * 0.5; sx += streakSpacing) {
      ctx.beginPath()
      ctx.moveTo(sx, 0)
      ctx.lineTo(sx + H * 0.35, H)
      ctx.stroke()
    }
    ctx.restore()
  }

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
    const sorted = [...world.buildings].sort((a, b) => (a.y ?? 0) - (b.y ?? 0))
    for (const b of sorted) {
      if (typeof b.x !== 'number' || typeof b.y !== 'number') continue
      if (b.x < cxLo || b.x > cxHi || b.y < ryLo || b.y > ryHi) continue
      drawBuilding(
        ctx,
        { id: b.id, kind: b.kind, x: b.x, y: b.y, condition: b.condition },
        ox,
        oy,
        TILE,
        bNight,
      )
    }
    type Cluster = { cx: number; cy: number; count: number; lineage: string }
    const clusters: Cluster[] = []
    const CITY_RADIUS_SQ = 14 * 14
    // Same viewport clip as the building draw loop. The city labels are
    // only visible if there's a cluster on screen, and the O(N) inner
    // find() against the growing cluster list was the single most
    // expensive per-frame call on low-end laptops.
    for (const b of world.buildings) {
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
    const lineageNames = world.lineage_names ?? {}
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const c of clusters) {
      if (c.count < 4) continue
      const name = lineageNames[c.lineage] ?? c.lineage.slice(0, 6)
      const label =
        c.count >= 12 ? `${name.toUpperCase()} CITY` : c.count >= 8 ? `${name} town` : `${name} village`
      const lx = (c.cx - ox) * TILE
      const ly = (c.cy - oy) * TILE - TILE * 2
      ctx.font = c.count >= 12 ? 'bold 12px monospace' : '10px monospace'
      ctx.fillStyle = 'rgba(0,0,0,0.65)'
      ctx.fillText(label, lx + 1, ly + 1)
      ctx.fillStyle = c.count >= 12 ? '#ffd28a' : c.count >= 8 ? '#e5c89a' : '#c8b890'
      ctx.fillText(label, lx, ly)
      ctx.font = '8px monospace'
      ctx.fillStyle = '#8a8170'
      ctx.fillText(`${c.count} bldgs`, lx, ly + 10)
    }
    ctx.restore()
  }

  if (viewFlags.animals && animals.length > 0) {
    ctx.save()
    const atlasReady = ATLAS_CREATURE.complete && ATLAS_CREATURE.naturalWidth > 0
    for (const animal of animals) {
      const small = animal.kind === 'fish' || animal.kind === 'bird' || animal.kind === 'rabbit'
      const size = small ? 11 : 14
      const speed =
        animal.kind === 'fish'
          ? 0.0028
          : animal.kind === 'bird'
            ? 0.005
            : animal.kind === 'wolf' || animal.kind === 'dog'
              ? 0.0042
              : 0.0036
      const amp = animal.kind === 'fish' ? 1.4 : animal.kind === 'bird' ? 1.6 : 0.7
      const phase = t * speed + animal.id * 0.7
      const yOff = Math.sin(phase) * amp
      const cx = (animal.x - ox) * TILE + TILE / 2
      const cy = (animal.y - oy) * TILE + TILE / 2 + yOff
      if (animal.kind !== 'fish' && animal.kind !== 'bird') {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.beginPath()
        ctx.ellipse(cx, cy + size * 0.42, size * 0.32, size * 0.14, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      if (atlasReady) {
        const frames = (SPRITE.animals as Record<string, readonly (readonly [number, number])[]>)[animal.kind]
        const tile = frames
          ? frames[(Math.floor(t / 260) + animal.id) % frames.length]
          : SPRITE.animals.rabbit[0]
        const flip = ((animal.id * 2654435761) >>> 0) & 1
        if (flip) {
          ctx.save()
          ctx.translate(cx + size / 2, cy - size / 2)
          ctx.scale(-1, 1)
          drawTile(ctx, ATLAS_CREATURE, tile, 0, 0, size)
          ctx.restore()
        } else {
          drawTile(ctx, ATLAS_CREATURE, tile, cx - size / 2, cy - size / 2, size)
        }
      } else {
        ctx.fillStyle = animal.kind === 'wolf' ? '#6a6a72' : '#8a6a4a'
        ctx.beginPath()
        ctx.ellipse(cx, cy, size * 0.32, size * 0.22, 0, 0, Math.PI * 2)
        ctx.fill()
      }
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

  for (const org of organisms) {
    if (!org.alive) continue
    // Data-driven house entry: use actual sleep_debt, energy, health fields - no text matching
    if (org.home_x && org.home_y) {
      const ddx = org.x - org.home_x
      const ddy = org.y - org.home_y
      if (ddx * ddx + ddy * ddy < 2.0) {
        if ((org.sleep_debt ?? 0) > 0.4 || org.energy < 0.1 || org.health < 0.15) continue
      }
    }
    const px = (org.x - ox) * TILE + TILE / 2
    const py = (org.y - oy) * TILE + TILE / 2
    const focused = isFocused(org)
    ctx.globalAlpha = focused ? 1 : 0.12

    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.beginPath()
    ctx.ellipse(px + 1, py + 3, 5, 3, 0, 0, Math.PI * 2)
    ctx.fill()

    const isSignaling = org.thought.startsWith('"') || org.thought.startsWith("'")
    if (isSignaling || org.thought === 'sounding alarm') {
      ctx.strokeStyle =
        org.thought.includes('!') || org.thought === 'sounding alarm'
          ? 'rgba(255,68,136,0.6)'
          : 'rgba(255,255,68,0.6)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(px, py, 10, 0, Math.PI * 2)
      ctx.stroke()
    } else if (org.thought === 'challenging' || org.thought === 'challenging alone') {
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

    if (org.infection > 0.15) {
      ctx.beginPath()
      ctx.arc(px, py, 8, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(187,255,68,${org.infection * 0.3})`
      ctx.fill()
    }

    if (org.is_elder) {
      ctx.strokeStyle = 'rgba(255,220,80,0.85)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 2])
      ctx.beginPath()
      ctx.arc(px, py, 9, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }

    if (org.id === selectedOrgId) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 2])
      ctx.beginPath()
      ctx.arc(px, py, 10, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }

    if (org.lineage_id) {
      ctx.strokeStyle = lineageColor(org.lineage_id)
      ctx.lineWidth = org.traits ? 1 + org.traits.resilience * 2 : 2
      ctx.beginPath()
      ctx.arc(px, py, 7, 0, Math.PI * 2)
      ctx.stroke()
    }

    if (org.carrying > 0) {
      ctx.fillStyle = org.carrying_type === 2 ? '#9a9a9a' : '#8b5e3c'
      ctx.fillRect(px - 3, py - 13, 6, 4)
    }

    const variant = orgVariant(org.id)
    const bodyR = variant.bodyRadius * (org.sex === 'male' ? 1.05 : 0.95)

    // Body fill: data-driven emotional state overrides thought colors when strong
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
      if (org.is_elder) bodyFill = '#e9c87a'
      else if (org.age < 900) bodyFill = '#8db5d6'
      else bodyFill = '#b8b8a8'
    }
    ctx.fillStyle = bodyFill
    ctx.beginPath()
    ctx.arc(px, py, bodyR, 0, Math.PI * 2)
    ctx.fill()

    if (viewFlags.fear && (org.fear_level ?? 0) > 0.25) {
      const fa = Math.min(0.55, (org.fear_level ?? 0) * 0.8)
      ctx.beginPath()
      ctx.arc(px, py, bodyR + 4, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(220,70,70,${fa})`
      ctx.fill()
    }

    if (viewFlags.lineageDot && org.lineage_id) {
      ctx.fillStyle = lineageColor(org.lineage_id)
      ctx.beginPath()
      ctx.arc(px, py + bodyR * 0.4, 1.6, 0, Math.PI * 2)
      ctx.fill()
    }

    if (viewFlags.pregnancy && org.pregnant) {
      ctx.strokeStyle = 'rgba(255,220,120,0.9)'
      ctx.lineWidth = 1.3
      ctx.setLineDash([2, 2])
      ctx.beginPath()
      ctx.arc(px, py, bodyR + 2.5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }

    const orgSex: 'male' | 'female' = org.sex === 'female' ? 'female' : 'male'
    const stage = deriveAgeStage(org.age ?? 0, !!org.is_elder, org.age_stage)
    const ageScale = stage === 'infant' ? 0.55 : stage === 'child' ? 0.78 : stage === 'adult' ? 1.1 : 1.0
    const spriteSize = Math.max(12, bodyR * 3.2 * ageScale)
    const frame = orgFrame(org.id, org.x, org.y, t)
    const drewLid = lineageErasMap[org.lineage_id] ?? ''
    const drew = drawPeopleTile(
      ctx,
      pickHumanSprite(orgSex, stage, frame),
      px - spriteSize / 2,
      py - spriteSize * 0.78,
      spriteSize,
    )
    if (!drew) {
      ctx.fillStyle = variant.hairColor
      ctx.beginPath()
      ctx.arc(px, py - bodyR * 0.7, bodyR * 0.55 * ageScale, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = variant.accent
      ctx.fillRect(px - bodyR * 0.7 * ageScale, py + bodyR * 0.15, bodyR * 1.4 * ageScale, 1.4)
    }
    const eraClothingColor = ERA_CLOTHING_COLOR[drewLid] ?? null
    if (eraClothingColor) {
      ctx.save()
      ctx.fillStyle = eraClothingColor
      ctx.globalAlpha = 0.55
      ctx.fillRect(
        px - bodyR * 0.85 * ageScale,
        py - bodyR * 0.1,
        bodyR * 1.7 * ageScale,
        bodyR * 0.85 * ageScale,
      )
      ctx.restore()
    }
    if (stage === 'elder') {
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(px + bodyR * 0.7, py + bodyR * 0.2)
      ctx.lineTo(px + bodyR * 1.1, py + bodyR * 1.2)
      ctx.stroke()
      ctx.restore()
    }

    const era = lineageErasMap[org.lineage_id] ?? ''
    if (era && era !== 'pre-stone' && era !== 'stone') {
      ctx.save()
      ctx.fillStyle = ERA_STRIPE_COLOR[era] ?? 'rgba(255,255,255,0.0)'
      ctx.globalAlpha = 0.65
      ctx.fillRect(px - bodyR, py + bodyR + 0.8, bodyR * 2, 1.4)
      ctx.restore()
    }
    if (org.is_leader) {
      ctx.save()
      ctx.font = '8px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('\u{1F451}', px, py - spriteSize * 0.92)
      ctx.restore()
    }
    const specEmoji = SPECIALTY_EMOJI[org.specialty ?? ''] ?? ''
    if (specEmoji) {
      ctx.save()
      ctx.font = '7px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(specEmoji, px + bodyR + 1, py - bodyR * 0.4)
      ctx.restore()
    }
    if (org.diseases && org.diseases.length > 0) {
      ctx.save()
      ctx.font = '7px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('\u{1F912}', px - bodyR - 1, py - bodyR * 0.4)
      ctx.restore()
    }
    if (org.tools) {
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
    if (org.degrees && org.degrees.length > 0) {
      ctx.save()
      ctx.font = '7px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('\u{1F393}', px - bodyR - 4, py + bodyR * 0.6)
      ctx.restore()
    }

    const barW = TILE - 2
    const bx = (org.x - ox) * TILE + 1
    const by = (org.y - oy) * TILE
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(bx, by - 5, barW, 2)
    ctx.fillStyle = '#55dd55'
    ctx.fillRect(bx, by - 5, barW * org.energy, 2)
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(bx, by - 2, barW, 2)
    ctx.fillStyle = '#4499ff'
    ctx.fillRect(bx, by - 2, barW * org.hydration, 2)

    const isSelected = org.id === selectedOrgId
    const showName = isSelected || viewFlags.names
    const showThought = (isSelected || viewFlags.thoughts) && org.thought && org.thought !== 'observing'

    if (showName) {
      ctx.font = isSelected ? 'bold 10px monospace' : '9px monospace'
      ctx.textAlign = 'center'
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      ctx.strokeText(org.name, px, py - 9)
      ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(255,255,255,0.95)'
      ctx.fillText(org.name, px, py - 9)
    }

    if (showThought) {
      ctx.font = '8px monospace'
      ctx.textAlign = 'center'
      ctx.lineWidth = 2.5
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      ctx.strokeText(org.thought, px, py - (showName ? 18 : 9))
      ctx.fillStyle = isSelected ? 'rgba(180,220,255,1)' : 'rgba(180,220,255,0.9)'
      ctx.fillText(org.thought, px, py - (showName ? 18 : 9))
    }
  }
  ctx.globalAlpha = 1

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

function WorldSprite({
  world,
  interp,
  selectedOrgId,
  overlay,
  focus,
  viewFlags,
  onFirstDraw,
  atX,
  atY,
  cameraStateRef,
  viewportDims,
}: {
  world: WorldState
  interp?: InterpRefs
  selectedOrgId: string | null
  overlay: string | null
  focus: string
  viewFlags: ViewFlags
  onFirstDraw: () => void
  atX: number
  atY: number
  cameraStateRef?: React.MutableRefObject<{ x: number; y: number; zoom: number }>
  viewportDims?: { w: number; h: number }
}) {
  useEntity()

  const W = world.grid.width * TILE
  const H = world.grid.height * TILE
  const dyn = useDynamicCanvas(W, H)

  const hasDrawn = useRef(false)
  const cachedDepth = useRef<number[][] | null>(null)
  const cachedBiomes = useRef<number[][] | null>(null)
  const filledOnce = useRef(false)
  const orgInterpCache = useRef<OrgInterpCache>({
    source: null,
    prevSource: null,
    frameId: -1,
    items: [],
    prevById: new Map(),
  })
  const animalInterpCache = useRef<AnimalInterpCache>({
    source: null,
    prevSource: null,
    frameId: -1,
    items: [],
    prevById: new Map(),
  })

  useLayoutEffect(() => {
    if (filledOnce.current) return
    dyn.ctx.fillStyle = '#1a4a80'
    dyn.ctx.fillRect(0, 0, W, H)
    dyn.markDirty()
    filledOnce.current = true
  }, [dyn, W, H])

  const worldRef = useRef<WorldState | null>(world)
  const selectedOrgIdRef = useRef<string | null>(selectedOrgId)
  const overlayRef = useRef<string | null>(overlay)
  const focusRef = useRef<string>(focus)
  const viewFlagsRef = useRef<ViewFlags>(viewFlags)
  worldRef.current = world
  selectedOrgIdRef.current = selectedOrgId
  overlayRef.current = overlay
  focusRef.current = focus
  viewFlagsRef.current = viewFlags

  useEffect(() => {
    if (!interp) return
    let raf = 0
    let stopped = false
    let lastDrawnAt: number = 0
    let lastDrawnT: number = -1
    let lastDrawnUI: string = ''
    let lowPerfFrameSkip = 0

    const tick = () => {
      if (stopped) return
      raf = requestAnimationFrame(tick)

      if (LOW_PERF) {
        lowPerfFrameSkip = (lowPerfFrameSkip + 1) % 2
        if (lowPerfFrameSkip === 1) return
      }

      const w = worldRef.current
      if (!w) return

      if (w.grid.depth_map) cachedDepth.current = w.grid.depth_map as number[][]
      if (w.grid.biomes) cachedBiomes.current = w.grid.biomes as number[][]

      const cur = interp.current.current
      const prev = interp.prev.current
      const curServerAt = interp.currentServerAt.current
      const prevServerAt = interp.prevServerAt.current
      const currentReceivedAt = interp.currentReceivedAt.current
      const slowMo = viewFlagsRef.current.slowMo
      const fastMo = viewFlagsRef.current.fastMo
      const speedDiv = slowMo ? 0.5 : fastMo ? 2.0 : 1.0
      const interval = Math.max(50, curServerAt - prevServerAt) / speedDiv
      const RENDER_LAG_MS = Math.min(120, interval * 0.5)
      const PREDICT_CAP = 2.0
      const t =
        cur && prev && interval > 0
          ? Math.max(
              0,
              Math.min(PREDICT_CAP, (performance.now() - currentReceivedAt - RENDER_LAG_MS) / interval),
            )
          : 1

      const uiKey = `${selectedOrgIdRef.current ?? ''}|${overlayRef.current ?? ''}|${focusRef.current}|${viewFlagsRef.current.territory ? 't' : ''}${viewFlagsRef.current.names ? 'n' : ''}${viewFlagsRef.current.thoughts ? 'h' : ''}${viewFlagsRef.current.animals ? 'a' : ''}${viewFlagsRef.current.grid ? 'g' : ''}`
      const settled =
        t >= PREDICT_CAP && lastDrawnT >= PREDICT_CAP && curServerAt === lastDrawnAt && uiKey === lastDrawnUI
      if (settled) return

      let renderOrgs = w.viewport_organisms ?? w.organisms
      if (prev && cur === w) {
        const prevOrgs = prev.viewport_organisms ?? prev.organisms
        const cache = orgInterpCache.current
        if (cache.prevSource !== prevOrgs) {
          cache.prevSource = prevOrgs
          cache.prevById.clear()
          for (const o of prevOrgs) cache.prevById.set(o.id, o)
        }
        if (cache.source !== renderOrgs || cache.frameId !== w.frame_id) {
          cache.source = renderOrgs
          cache.frameId = w.frame_id
          cache.items = renderOrgs.map((o) => ({ ...o }))
        }
        const items = cache.items
        for (let i = 0; i < renderOrgs.length; i++) {
          const o = renderOrgs[i]
          const out = items[i]
          const p = cache.prevById.get(o.id)
          if (p && p.alive && o.alive) {
            out.x = p.x + (o.x - p.x) * t
            out.y = p.y + (o.y - p.y) * t
          } else {
            out.x = o.x
            out.y = o.y
          }
        }
        renderOrgs = items
      }
      let renderAnimals = w.viewport_animals ?? w.animals
      if (prev && cur === w) {
        const prevAnimals = prev.viewport_animals ?? prev.animals
        const cache = animalInterpCache.current
        if (cache.prevSource !== prevAnimals) {
          cache.prevSource = prevAnimals
          cache.prevById.clear()
          for (const a of prevAnimals) cache.prevById.set(a.id, a)
        }
        if (cache.source !== renderAnimals || cache.frameId !== w.frame_id) {
          cache.source = renderAnimals
          cache.frameId = w.frame_id
          cache.items = renderAnimals.map((a) => ({ ...a }))
        }
        const items = cache.items
        for (let i = 0; i < renderAnimals.length; i++) {
          const a = renderAnimals[i]
          const out = items[i]
          const p = cache.prevById.get(a.id)
          if (p) {
            out.x = p.x + (a.x - p.x) * t
            out.y = p.y + (a.y - p.y) * t
          } else {
            out.x = a.x
            out.y = a.y
          }
        }
        renderAnimals = items
      }

      const lerpCycle = (a: number, b: number, k: number) => {
        let diff = b - a
        if (diff > 0.5) diff -= 1
        if (diff < -0.5) diff += 1
        const out = a + diff * k
        return ((out % 1) + 1) % 1
      }
      const lerpedDay = prev ? lerpCycle(prev.day_progress, w.day_progress, t) : w.day_progress
      const lerpedSeason = prev ? lerpCycle(prev.season_progress, w.season_progress, t) : w.season_progress

      const enrichedGrid = {
        ...w.grid,
        depth_map: cachedDepth.current ?? w.grid.depth_map,
        biomes: cachedBiomes.current ?? w.grid.biomes,
      }
      const enrichedWorld: WorldState = {
        ...w,
        grid: enrichedGrid,
        viewport_organisms: renderOrgs,
        viewport_animals: renderAnimals,
        day_progress: lerpedDay,
        season_progress: lerpedSeason,
      }

      // Compute the visible-tile window so per-tile overlay loops can
      // skip rows/cols off-screen. We give a 4-tile margin so panning
      // doesn't reveal blank borders before the next frame redraws.
      let bounds: { c0: number; c1: number; r0: number; r1: number } | undefined
      if (cameraStateRef && viewportDims && viewportDims.w > 0 && viewportDims.h > 0) {
        const cam = cameraStateRef.current
        const zoom = cam.zoom > 0 ? cam.zoom : 1
        const halfW = viewportDims.w / (2 * zoom)
        const halfH = viewportDims.h / (2 * zoom)
        const MARGIN = 4
        const wG = w.grid.width
        const hG = w.grid.height
        const c0 = Math.max(0, Math.floor((cam.x - halfW) / TILE) - MARGIN)
        const c1 = Math.min(wG, Math.ceil((cam.x + halfW) / TILE) + MARGIN)
        const r0 = Math.max(0, Math.floor((cam.y - halfH) / TILE) - MARGIN)
        const r1 = Math.min(hG, Math.ceil((cam.y + halfH) / TILE) + MARGIN)
        if (c1 > c0 && r1 > r0) bounds = { c0, c1, r0, r1 }
      }

      drawWorldOnCanvas(
        dyn.ctx,
        enrichedWorld,
        selectedOrgIdRef.current,
        overlayRef.current,
        focusRef.current,
        viewFlagsRef.current,
        bounds,
      )
      dyn.markDirty()

      lastDrawnAt = curServerAt
      lastDrawnT = t
      lastDrawnUI = uiKey

      if (!hasDrawn.current) {
        hasDrawn.current = true
        requestAnimationFrame(() => requestAnimationFrame(onFirstDraw))
      }
    }

    raf = requestAnimationFrame(tick)
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      _imgBuf = null
      _baseCanvas = null
      _baseKey = null
    }
  }, [interp, dyn, onFirstDraw, cameraStateRef, viewportDims])

  return (
    <>
      <Transform x={atX} y={atY} />
      <Sprite width={W} height={H} dynamicSrc={dyn.id} color="#ffffff" zIndex={0} />
    </>
  )
}

function CameraController({
  worldW,
  worldH,
  containerW,
  containerH,
  containerEl,
  cameraStateRef,
  followTarget,
}: {
  worldW: number
  worldH: number
  containerW: number
  containerH: number
  containerEl: HTMLDivElement | null
  cameraStateRef: React.MutableRefObject<{ x: number; y: number; zoom: number }>
  followTarget: { x: number; y: number } | null
}) {
  const camera = useCamera()
  const drag = useRef({ active: false, startPX: 0, startPY: 0, startCamX: 0, startCamY: 0 })
  const initialised = useRef(false)
  const minZoom = Math.min(containerW / worldW, containerH / worldH) * 0.85

  useEffect(() => {
    if (initialised.current) return
    const tx = worldW / 2
    const ty = worldH / 2
    const fitZoom = Math.max(minZoom, Math.min(containerW / worldW, containerH / worldH) * 0.95)
    let raf = 0
    const trySet = () => {
      camera.setPosition(tx, ty)
      camera.setZoom(fitZoom)
      const pos = camera.getPosition?.()
      if (!pos || Math.abs(pos.x - tx) > 2 || Math.abs(pos.y - ty) > 2) {
        raf = requestAnimationFrame(trySet)
      } else {
        cameraStateRef.current = { x: tx, y: ty, zoom: fitZoom }
        initialised.current = true
      }
    }
    raf = requestAnimationFrame(trySet)
    return () => cancelAnimationFrame(raf)
  }, [camera, cameraStateRef, containerH, containerW, minZoom, worldH, worldW])

  const prevFollowRef = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!followTarget) return
    const prev = prevFollowRef.current
    const isNewTarget =
      !prev || Math.abs(prev.x - followTarget.x) > 30 || Math.abs(prev.y - followTarget.y) > 30
    camera.setPosition(followTarget.x, followTarget.y)
    cameraStateRef.current.x = followTarget.x
    cameraStateRef.current.y = followTarget.y
    if (isNewTarget) {
      const TRACK_ZOOM = 3.5
      camera.setZoom(TRACK_ZOOM)
      cameraStateRef.current.zoom = TRACK_ZOOM
    }
    prevFollowRef.current = { x: followTarget.x, y: followTarget.y }
  }, [followTarget, camera, cameraStateRef])

  useEffect(() => {
    if (!containerEl) return

    const clamp = (x: number, y: number, zoom: number) => {
      const halfW = containerW / (2 * zoom)
      const halfH = containerH / (2 * zoom)
      const cx = halfW >= worldW / 2 ? x : Math.max(halfW, Math.min(worldW - halfW, x))
      const cy = halfH >= worldH / 2 ? y : Math.max(halfH, Math.min(worldH - halfH, y))
      return { x: cx, y: cy }
    }

    const onDown = (e: PointerEvent) => {
      drag.current.active = true
      drag.current.startPX = e.clientX
      drag.current.startPY = e.clientY
      const pos = camera.getPosition()
      drag.current.startCamX = pos.x
      drag.current.startCamY = pos.y
    }
    const onMove = (e: PointerEvent) => {
      if (!drag.current.active) return
      const zoom = camera.getZoom()
      const raw = {
        x: drag.current.startCamX - (e.clientX - drag.current.startPX) / zoom,
        y: drag.current.startCamY - (e.clientY - drag.current.startPY) / zoom,
      }
      const { x: nx, y: ny } = clamp(raw.x, raw.y, zoom)
      camera.setPosition(nx, ny)
      cameraStateRef.current.x = nx
      cameraStateRef.current.y = ny
    }
    const onUp = () => {
      drag.current.active = false
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 0.9
      const nz = Math.max(minZoom, Math.min(8, camera.getZoom() * factor))
      camera.setZoom(nz)
      cameraStateRef.current.zoom = nz
      const pos = camera.getPosition()
      const { x, y } = clamp(pos.x, pos.y, nz)
      camera.setPosition(x, y)
      cameraStateRef.current.x = x
      cameraStateRef.current.y = y
    }

    containerEl.addEventListener('pointerdown', onDown)
    containerEl.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      containerEl.removeEventListener('pointerdown', onDown)
      containerEl.removeEventListener('wheel', onWheel)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [camera, cameraStateRef, containerEl, containerW, containerH, minZoom, worldW, worldH])

  const clampCam = useRef<((x: number, y: number, zoom: number) => { x: number; y: number }) | null>(null)
  clampCam.current = (x, y, zoom) => {
    const halfW = containerW / (2 * zoom)
    const halfH = containerH / (2 * zoom)
    const cx = halfW >= worldW / 2 ? x : Math.max(halfW, Math.min(worldW - halfW, x))
    const cy = halfH >= worldH / 2 ? y : Math.max(halfH, Math.min(worldH - halfH, y))
    return { x: cx, y: cy }
  }

  useGestures(
    {
      onPinch: ({ delta }) => {
        const factor = 1 + delta
        const nz = Math.max(minZoom, Math.min(8, camera.getZoom() * factor))
        camera.setZoom(nz)
        cameraStateRef.current.zoom = nz
        const pos = camera.getPosition()
        const { x, y } = clampCam.current!(pos.x, pos.y, nz)
        camera.setPosition(x, y)
        cameraStateRef.current.x = x
        cameraStateRef.current.y = y
      },
    },
    { target: containerEl },
  )

  return null
}

interface Props {
  world: WorldState
  interp?: InterpRefs
  sandboxArmed?: boolean
  onSandboxApply?: (worldX: number, worldY: number) => void
}

export function WorldView({ world, interp, sandboxArmed, onSandboxApply }: Props) {
  const selectedOrgId = useUIStore((s) => s.selectedOrgId)
  const followOrgId = useUIStore((s) => s.followOrgId)
  const overlay = useUIStore((s) => s.overlay)
  const focus = useUIStore((s) => s.focus)
  const viewFlags = useUIStore((s) => s.viewFlags)
  const onOrgSelect = useUIStore((s) => s.selectOrg)
  const W = world.grid.width * TILE
  const H = world.grid.height * TILE
  const cx = W / 2
  const cy = H / 2

  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0

  const containerRef = useRef<HTMLDivElement>(null)
  const cameraStateRef = useRef({ x: cx, y: cy, zoom: 1.5 })
  const [dims, setDims] = useState({ w: 0, h: 0 })
  const [mapReady, setMapReady] = useState(false)

  const followTarget = followOrgId
    ? (() => {
        const org = world.organisms.find((o) => o.id === followOrgId && o.alive)
        return org ? { x: (org.x - ox) * TILE, y: (org.y - oy) * TILE } : null
      })()
    : null

  // Track pointer-down position so we can distinguish a tap (select)
  // from a drag-then-release (pan). Without this every pan ends with
  // an accidental org-select on the tile under the release point -
  // especially painful on touch where finger jitter is large.
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerDownPos.current = { x: e.clientX, y: e.clientY }
  }
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const down = pointerDownPos.current
    pointerDownPos.current = null
    if (down) {
      const dx = e.clientX - down.x
      const dy = e.clientY - down.y
      if (dx * dx + dy * dy > 36) return
    }
    const rect = containerRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const { x: camX, y: camY, zoom } = cameraStateRef.current
    const canvasTileX = (camX + (sx - dims.w / 2) / zoom) / TILE
    const canvasTileY = (camY + (sy - dims.h / 2) / zoom) / TILE
    const worldX = canvasTileX + ox
    const worldY = canvasTileY + oy

    if (sandboxArmed && onSandboxApply) {
      onSandboxApply(worldX, worldY)
      return
    }

    const isCoarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

    let nearestOrg: { id: string; dist: number } | null = null
    let nearestOrgDist = isCoarse ? 5.0 : 3.0
    for (const org of world.viewport_organisms ?? world.organisms) {
      if (!org.alive) continue
      const d = Math.abs(org.x - worldX) + Math.abs(org.y - worldY)
      if (d < nearestOrgDist) {
        nearestOrgDist = d
        nearestOrg = { id: org.id, dist: d }
      }
    }
    if (nearestOrg && nearestOrg.dist < 1.2) {
      onOrgSelect(nearestOrg.id)
      return
    }

    const tx = Math.floor(worldX)
    const ty = Math.floor(worldY)
    const localCol = tx - ox
    const localRow = ty - oy
    const TILE_WATER = 2
    const TILE_HUT = 8
    const tileRow = world.grid?.tiles?.[localRow]
    const tileVal = tileRow ? tileRow[localCol] : undefined
    if (tileVal === TILE_WATER && (!nearestOrg || nearestOrg.dist >= 2.5)) {
      onOrgSelect(null)
      return
    }
    const isHut = tileVal === TILE_HUT
    const structRow = world.grid?.structure?.[localRow]
    const structVal = (structRow && structRow[localCol]) || 0
    if (isHut || structVal >= 0.35) {
      let bestHost: { id: string; age: number } | null = null
      for (const org of world.organisms) {
        if (!org.alive) continue
        const hx = Math.floor(org.home_x)
        const hy = Math.floor(org.home_y)
        if (hx === tx && hy === ty) {
          if (!bestHost || org.age > bestHost.age) {
            bestHost = { id: org.id, age: org.age }
          }
        }
      }
      if (bestHost) {
        useSceneStore.getState().enter({ kind: 'home', orgId: bestHost.id })
        return
      }
    }

    onOrgSelect(nearestOrg ? nearestOrg.id : null)
  }

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const { clientWidth, clientHeight } = el
      if (clientWidth > 0 && clientHeight > 0) {
        setDims({ w: clientWidth, h: clientHeight })
      }
    }
    measure()
    const obs = new ResizeObserver(measure)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        cursor: sandboxArmed ? 'crosshair' : 'grab',
        position: 'relative',
        // touch-action: none stops the browser from claiming
        // two-finger pinch as page-zoom; the gesture handler
        // gets the events instead.
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#1a4a80',
          zIndex: 10,
          pointerEvents: 'none',
          opacity: mapReady ? 0 : 1,
          transition: 'opacity 280ms ease-out',
        }}
      />
      {dims.w > 0 && (
        <Game gravity={0} width={dims.w} height={dims.h} style={{ display: 'block' }}>
          <World background="#1a4a80">
            <Camera2D />

            <Entity>
              <WorldSprite
                world={world}
                interp={interp}
                selectedOrgId={selectedOrgId}
                overlay={overlay}
                focus={focus}
                viewFlags={viewFlags}
                onFirstDraw={() => setMapReady(true)}
                atX={cx}
                atY={cy}
                cameraStateRef={cameraStateRef}
                viewportDims={dims}
              />
            </Entity>

            <CameraController
              worldW={W}
              worldH={H}
              containerW={dims.w}
              containerH={dims.h}
              containerEl={containerRef.current}
              cameraStateRef={cameraStateRef}
              followTarget={followTarget}
            />
          </World>
        </Game>
      )}
    </div>
  )
}
