import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Game, World, Entity, Transform, Sprite, Camera2D, useCamera, useEntity, useDynamicCanvas, useGestures } from 'cubeforge'
import type { WorldState } from '../types'
import type { InterpRefs } from '../simulation/useSimulation'
import { useUIStore, type ViewFlags } from '../stores/store'
import { lineageColor } from '../utils/constants'
import { SPRITE, ATLAS_TOWN, ATLAS_CREATURE, drawTile, onAnyAtlasLoaded, pickAnimalTile } from '../utils/sprites'

onAnyAtlasLoaded(() => { _baseKey = null })

const TILE = 8

const TILE_COLORS: Record<number, string> = {
  0: '#0a0a0a',
  1: '#4a7c3f',
  2: '#2e6db4',
  3: '#6abf45',
  4: '#e8450a',
  5: '#888888',
  6: '#555544',
  7: '#cc6600',
  8: '#8b6914',
  9: '#3a6688',
  10: '#c8a020',
  11: '#2a2018',
  12: '#ddeef5',
  13: '#d9c07a',
}

const BIOME_OVERLAYS: Record<number, string> = {
  0: 'rgba(80,140,60,0.08)',
  1: 'rgba(20,80,20,0.14)',
  2: 'rgba(200,160,60,0.28)',
  3: 'rgba(20,100,100,0.10)',
  4: 'rgba(200,230,255,0.10)',
  5: 'rgba(160,40,20,0.18)',
}

function orgVariant(id: string): { hueShift: number; accent: string; bodyRadius: number; hairColor: string } {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  const a = (h >>> 0) / 0xffffffff
  const b = ((h ^ 0x9e3779b9) >>> 0) / 0xffffffff
  const c = ((h ^ 0x85ebca6b) >>> 0) / 0xffffffff
  const accents = ['#d4a843', '#e08070', '#7ab0e0', '#9070b0', '#7ebd6a', '#e0c070', '#c08060']
  const hairs   = ['#1a1310', '#3a2618', '#5a3a20', '#7a5028', '#a86838', '#cc9844', '#dcdcdc']
  return {
    hueShift:   (a - 0.5) * 36,
    accent:     accents[Math.floor(b * accents.length)],
    bodyRadius: 4.6 + c * 1.0,
    hairColor:  hairs[Math.floor(c * hairs.length)],
  }
}

function parseHex(h: string): [number, number, number] {
  const s = h.replace('#', '')
  return [parseInt(s.slice(0,2),16), parseInt(s.slice(2,4),16), parseInt(s.slice(4,6),16)]
}
function parseRgbaStr(s: string): [number, number, number, number] {
  const m = s.match(/[\d.]+/g)!
  return [+m[0], +m[1], +m[2], +m[3]]
}

const TILE_RGB: Record<number, [number,number,number]> =
  Object.fromEntries(Object.entries(TILE_COLORS).map(([k,v]) => [+k, parseHex(v)]))

const BIOME_RGBA: Record<number, [number,number,number,number]> =
  Object.fromEntries(Object.entries(BIOME_OVERLAYS).map(([k,v]) => [+k, parseRgbaStr(v)]))

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
} | null = null
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
) {
  return !!key
    && key.width === width
    && key.height === height
    && key.origin_x === origin_x
    && key.origin_y === origin_y
    && key.tiles === tiles
    && key.biomes === biomes
    && key.depth_map === depth_map
}

function getBaseLayerCanvas(world: WorldState): HTMLCanvasElement | null {
  const { width, height, tiles, biomes } = world.grid
  if (!tiles || tiles.length < height) return null
  const depth_map = world.grid.depth_map as number[][] | undefined
  const origin_x = world.grid.origin_x ?? 0
  const origin_y = world.grid.origin_y ?? 0
  const W = width * TILE
  const H = height * TILE

  if (_baseCanvas && baseLayerMatches(_baseKey, width, height, origin_x, origin_y, tiles, biomes, depth_map)) {
    return _baseCanvas
  }

  const canvas = _baseCanvas && _baseCanvas.width === W && _baseCanvas.height === H
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
  for (let row = 0; row < height; row++) {
    const tileRow  = tiles[row]
    const biomeRow = biomes?.[row]
    const depthRow = depth_map?.[row]
    const tileRowPrev = row > 0 ? tiles[row - 1] : undefined
    for (let col = 0; col < width; col++) {
      const tid = tileRow?.[col] ?? 0
      const rgb = TILE_RGB[tid] ?? TILE_RGB[0]
      let [r, g, b] = rgb

      if (tid === 2 && depthRow) {
        const dv = depthRow[col]
        if (dv < 255) {
          const t_ = 1 - dv / 200
          r = (100 - t_ * 28) | 0
          g = (170 - t_ * 42) | 0
          b = (220 - t_ * 30) | 0
        }
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
      if (tid !== 2 && tid !== 9) {
        const w = col > 0 ? tileRow?.[col - 1] : undefined
        const n = tileRowPrev?.[col]
        if (w === 2 || w === 9 || n === 2 || n === 9) shading = 6
      }

      const varAmt = varAmtFor(tid)
      const bx = col * TILE, by = row * TILE
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
          if (rr < 0) rr = 0; else if (rr > 255) rr = 255
          if (gg < 0) gg = 0; else if (gg > 255) gg = 255
          if (bb < 0) bb = 0; else if (bb > 255) bb = 255
          d[pi] = rr; d[pi+1] = gg; d[pi+2] = bb; d[pi+3] = 255
        }
      }
    }
  }

  const baseCtx = canvas.getContext('2d')!
  baseCtx.putImageData(imgData, 0, 0)
  if (biomes && ATLAS_TOWN.complete) {
    drawTrees(baseCtx, width, height, tiles, biomes)
  }
  _baseCanvas = canvas
  _baseKey = { width, height, origin_x, origin_y, tiles, biomes, depth_map }
  return canvas
}

const THOUGHT_COLORS: Record<string, string> = {
  eating:                  '#6abf45',
  drinking:                '#4499ff',
  'heat dangerous':        '#e8450a',
  'hungry - searching':    '#cc8800',
  'thirsty - searching':   '#0099cc',
  'moving to known food':  '#aadd55',
  'moving to known water': '#55aaff',
  'avoiding danger':       '#ff6644',
  dying:                   '#ff0000',
  satisfied:               '#ffffff',
  socializing:             '#ffdd88',
  wary:                    '#ff9900',
  'signaling food':        '#ffff44',
  'sounding alarm':        '#ff4488',
  challenging:             '#ff2200',
  'challenging alone':     '#cc4422',
  exploring:               '#888888',
  observing:               '#555555',
  'feeling weak':          '#bbff44',
  'coexisting peacefully': '#55ff88',
  hunting:                 '#ffaa22',
  gathering:               '#c8a050',
  building:                '#ffcc44',
  'building shelter':      '#ffd700',
  'digging for water':     '#3a9bd4',
  'digging in the sand':   '#d9c07a',
  'struck water':          '#33ddff',
  'tilling the soil':      '#8a6a3a',
  'foraging wild food':    '#7ed957',
  'foraging the brush':    '#9bc850',
  'searching the brush':   '#a8b86a',
  'dancing with kin':      '#ff7fd4',
  'dancing by the fire':   '#ff9ae0',
  'dancing alone':         '#c885b0',
  singing:                 '#a98fff',
  'singing by the fire':   '#bda6ff',
  'reflecting quietly':    '#8fd4c4',
  'taking a quiet moment': '#9fd9ca',
  'storing food':          '#d4b34a',
  'eating stored food':    '#c8d96a',
  'scouting the area':     '#6fc0e8',
  'surveying the land':    '#7fcaf0',
  'marking territory':     '#e0a040',
  'marking the homeland':  '#e8b050',
}

function drawCloudShape(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  cloudW: number, cloudH: number,
  alpha: number,
  color: string,
  bumpSeed: number,
) {
  let state = (bumpSeed | 0) || 1
  const rand = () => {
    state = (state * 1664525 + 1013904223) | 0
    return ((state >>> 0) % 10000) / 10000
  }

  const drawPuff = (px: number, py: number, pr: number, pa: number) => {
    const g = ctx.createRadialGradient(px, py, 0, px, py, pr)
    g.addColorStop(0,    `rgba(${color},${pa})`)
    g.addColorStop(0.55, `rgba(${color},${pa * 0.7})`)
    g.addColorStop(0.85, `rgba(${color},${pa * 0.25})`)
    g.addColorStop(1,    `rgba(${color},0)`)
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

function drawTrees(
  ctx: CanvasRenderingContext2D,
  width: number, height: number,
  tiles: number[][], biomes?: number[][],
) {
  if (!biomes || !ATLAS_TOWN.complete) return
  const TILE_GRASS = 1
  const TILE_FOOD  = 3
  const BIOME_GRASS    = 0
  const BIOME_FOREST   = 1
  const BIOME_DESERT   = 2
  const BIOME_TUNDRA   = 3
  const BIOME_WETLAND  = 4
  const BIOME_VOLCANIC = 5

  const TREE_SIZE = 16

  const placed: Uint8Array = new Uint8Array(width * height)
  const order: number[] = []
  for (let i = 0; i < width * height; i++) order.push(i)
  for (let i = order.length - 1; i > 0; i--) {
    const r = (i * 2654435761) >>> 0
    const j = r % (i + 1)
    const tmp = order[i]; order[i] = order[j]; order[j] = tmp
  }

  for (const idx of order) {
    const x = idx % width
    const y = Math.floor(idx / width)
    const tRow = tiles[y]; const bRow = biomes[y]
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
      case BIOME_FOREST:   chance = 0.32; spacing = 2; break
      case BIOME_WETLAND:  chance = 0.18; spacing = 3; break
      case BIOME_GRASS:    chance = 0.06; spacing = 5; break
      case BIOME_TUNDRA:   chance = 0.10; spacing = 4; break
      case BIOME_DESERT:   chance = 0.03; spacing = 6; break
      case BIOME_VOLCANIC: chance = 0.05; spacing = 4; break
    }
    if (r0 > chance) continue

    let too_close = false
    for (let dy = -spacing; dy <= spacing && !too_close; dy++) {
      for (let dx = -spacing; dx <= spacing && !too_close; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx; const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        if (placed[ny * width + nx]) too_close = true
      }
    }
    if (too_close) continue

    placed[y * width + x] = 1

    const sz = TREE_SIZE * (0.85 + (r1 * 17 % 1) * 0.4)
    const cx = x * TILE + (TILE - sz) / 2 + (r1 - 0.5) * TILE * 0.5
    const cy = y * TILE + (TILE - sz) / 2 + (r0 * 7 % 1 - 0.5) * TILE * 0.5

    let sprite = SPRITE.trees.oak_mid
    switch (biome) {
      case BIOME_FOREST:
        sprite = r1 < 0.45 ? SPRITE.trees.conifer
               : r1 < 0.75 ? SPRITE.trees.oak_dark
               : SPRITE.trees.oak_mid
        break
      case BIOME_WETLAND:  sprite = r1 < 0.6 ? SPRITE.trees.bush : SPRITE.trees.oak_mid; break
      case BIOME_GRASS:    sprite = r1 < 0.6 ? SPRITE.trees.oak_light : SPRITE.trees.oak_mid; break
      case BIOME_TUNDRA:   sprite = SPRITE.trees.conifer_dk; break
      case BIOME_DESERT:   sprite = r1 < 0.5 ? SPRITE.trees.cactus : SPRITE.trees.dead; break
      case BIOME_VOLCANIC: sprite = SPRITE.trees.dead; break
    }
    drawTile(ctx, ATLAS_TOWN, sprite, cx, cy, sz)
  }
}

function drawClouds(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  weather: WorldState['weather'],
  t: number,
) {
  if (!weather || weather.kind === 'clear') return
  const isStorm   = weather.kind === 'storm'
  const count     = isStorm ? 9 : 5
  const baseAlpha = weather.intensity * (isStorm ? 0.62 : 0.38)
  const color     = isStorm ? '16,20,42' : '130,148,170'

  ctx.save()
  for (let i = 0; i < count; i++) {
    const seed   = (i + 1) * 137
    const baseX  = ((seed * 73)  % 1000) / 1000 * W
    const baseY  = isStorm
      ? (((seed * 41)  % 750)  / 750  * 0.75 + 0.10) * H
      : (((seed * 41)  % 600)  / 600  * 0.60 + 0.05) * H
    const speed  = 0.014 + (i % 5) * 0.006
    const cx     = ((baseX + t * speed) % (W + 360)) - 180
    const cy     = baseY

    const cloudW = W * (0.09 + (i % 4) * 0.055)
    const cloudH = cloudW * (0.28 + (i % 3) * 0.07)
    const alpha  = baseAlpha * (0.75 + 0.25 * ((i * 13 + 7) % 10) / 10)

    drawCloudShape(ctx, cx, cy, cloudW, cloudH, alpha, color, i * 7 + 3)

    if (isStorm) {
      drawCloudShape(ctx, cx + cloudW * 0.08, cy + cloudH * 0.25,
        cloudW * 0.88, cloudH * 0.70,
        alpha * 0.55, '8,10,24', i * 5 + 11)
    }
  }
  ctx.restore()
}

const fpsSamples: number[] = []

let _scratchA: Float32Array | null = null
let _scratchB: Float32Array | null = null
function scratchA(n: number): Float32Array {
  if (!_scratchA || _scratchA.length < n) _scratchA = new Float32Array(n)
  else _scratchA.fill(0, 0, n)
  return _scratchA
}
function scratchB(n: number): Float32Array {
  if (!_scratchB || _scratchB.length < n) _scratchB = new Float32Array(n)
  else _scratchB.fill(0, 0, n)
  return _scratchB
}

function drawWorldOnCanvas(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  selectedOrgId: string | null,
  overlay: string | null,
  focus: string,
  viewFlags: ViewFlags,
) {
  const { width, height, tiles, fire_intensity, structure } = world.grid
  const { food_trail, water_trail, path_trail, fertility, hazard } = world.grid
  if (!tiles || tiles.length < height) return
  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
  const organisms = world.viewport_organisms ?? world.organisms ?? []
  const animals = world.viewport_animals ?? world.animals ?? []
  const W = width * TILE
  const H = height * TILE
  const t = Date.now()

  const base = getBaseLayerCanvas(world)
  if (!base) return
  ctx.drawImage(base, 0, 0)

  const seasonTints: Record<string, string> = {
    decline:  'rgba(180,110,30,0.07)',
    scarcity: 'rgba(90,60,30,0.11)',
    recovery: 'rgba(30,120,150,0.07)',
  }
  const skyTint = seasonTints[world.season]
  if (skyTint) { ctx.fillStyle = skyTint; ctx.fillRect(0, 0, W, H) }

  {
    const dp = world.day_progress ?? 0.5
    if (!world.is_day) {
      const mid = 1 - Math.abs(dp - 0.85) * 4
      ctx.fillStyle = `rgba(20,28,70,${0.10 + Math.max(0, mid) * 0.06})`
      ctx.fillRect(0, 0, W, H)
    } else if (dp < 0.10) {
      ctx.fillStyle = `rgba(255,170,90,${(0.10 - dp) / 0.10 * 0.06})`
      ctx.fillRect(0, 0, W, H)
    } else if (dp > 0.60) {
      ctx.fillStyle = `rgba(230,130,70,${(dp - 0.60) / 0.10 * 0.07})`
      ctx.fillRect(0, 0, W, H)
    }
  }

  if (world.weather && world.weather.kind !== 'clear') {
    const wi = Math.max(0, Math.min(1, world.weather.intensity ?? 0))
    const kind = world.weather.kind
    if (kind === 'storm') {
      ctx.fillStyle = `rgba(40,55,90,${0.06 + wi * 0.10})`
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
      ctx.strokeStyle = isStorm ? `rgba(180,195,230,${0.10 + wi * 0.10})`
                                : `rgba(170,190,225,${0.08 + wi * 0.08})`
      ctx.lineWidth = 1
      const streaks = Math.round((isStorm ? 80 : 50) * (0.4 + wi * 0.6))
      const slant   = isStorm ? 6 : 3
      for (let i = 0; i < streaks; i++) {
        const sxp = (i * 137 + (t * 0.7)) % W
        const syp = ((i * 251) + (t * (isStorm ? 1.4 : 1.0))) % H
        ctx.beginPath()
        ctx.moveTo(sxp, syp)
        ctx.lineTo(sxp - slant, syp + 8)
        ctx.stroke()
      }
    }
  }

  if (!world.is_day || (world.day_progress ?? 0) > 0.05) {
    const tt = t * 0.001
    ctx.fillStyle = world.is_day
      ? 'rgba(255,255,255,0.55)'
      : 'rgba(180,200,240,0.30)'
    for (let row = 0; row < height; row += 2) {
      const drow = world.grid.depth_map?.[row]
      if (!drow) continue
      for (let col = 0; col < width; col += 2) {
        if ((drow[col] ?? 255) >= 254) continue
        let h = (col * 374761393 + row * 668265263) | 0
        h = ((h ^ (h >>> 13)) * 1274126177) >>> 0
        const phase = (h & 0xff) / 255 * Math.PI * 2
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
      ctx.fillStyle = 'rgba(255,255,255,0.42)'
      for (let row = 1; row < height - 1; row++) {
        const drow = dm[row]
        if (!drow) continue
        for (let col = 1; col < width - 1; col++) {
          if ((drow[col] ?? 255) >= 254) continue
          const n  = dm[row - 1]?.[col]     ?? 255
          const s  = dm[row + 1]?.[col]     ?? 255
          const e  = drow[col + 1]          ?? 255
          const w  = drow[col - 1]          ?? 255
          if (n < 254 && s < 254 && e < 254 && w < 254) continue
          const px = col * TILE
          const py = row * TILE
          if (n >= 254) ctx.fillRect(px, py,           TILE, 1)
          if (s >= 254) ctx.fillRect(px, py + TILE - 1, TILE, 1)
          if (e >= 254) ctx.fillRect(px + TILE - 1, py, 1, TILE)
          if (w >= 254) ctx.fillRect(px, py,           1, TILE)
        }
      }
    }
  }

  // Lake shimmer — animated sparkle on shallow water tiles (depth 180-253)
  {
    const dm = world.grid.depth_map
    if (dm) {
      const shimmerT = t * 0.0015
      ctx.fillStyle = 'rgba(180,230,255,0.28)'
      for (let row = 0; row < height; row++) {
        const dr = dm[row]
        if (!dr) continue
        for (let col = 0; col < width; col++) {
          const d = dr[col] ?? 255
          if (d < 180 || d >= 254) continue
          let h = (col * 374761393 + row * 668265263 + (shimmerT * 100 | 0)) | 0
          h = ((h ^ (h >>> 13)) * 1274126177) >>> 0
          const pulse = Math.sin(shimmerT * 2.1 + (h & 0xff) / 255 * Math.PI * 2)
          if (pulse < 0.6) continue
          ctx.fillRect(col * TILE + ((h >>> 8) & 3), row * TILE + ((h >>> 10) & 3), 2, 1)
        }
      }
      // Subtle wave lines on lakes
      ctx.save()
      ctx.strokeStyle = 'rgba(140,200,240,0.18)'
      ctx.lineWidth = 0.8
      for (let row = 1; row < height - 1; row++) {
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

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const t = tiles[row][col]
      if (t !== 4 && t !== 7 && t !== 8) continue
      const px = col * TILE
      const py = row * TILE

      if (t === 4 && fire_intensity) {
        const fi = fire_intensity[row][col]
        ctx.fillStyle = `rgba(255,120,0,${fi * 0.55})`
        ctx.fillRect(px, py, TILE, TILE)
      }

      if (t === 7 && fire_intensity) {
        const fi = fire_intensity[row][col]
        ctx.fillStyle = `rgba(255,200,80,${fi * 0.7})`
        ctx.fillRect(px, py, TILE, TILE)
        ctx.fillStyle = `rgba(255,160,40,${fi * 0.12})`
        ctx.fillRect(px - TILE * 2, py - TILE * 2, TILE * 5, TILE * 5)
        if (TILE >= 8) {
          const cx2 = px + TILE / 2
          ctx.fillStyle = `rgba(255,80,0,${fi * 0.6})`
          ctx.beginPath(); ctx.arc(cx2, py + TILE * 0.4, TILE * 0.18, 0, Math.PI * 2); ctx.fill()
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
        // Draw hut 2x larger than a tile, centered over the tile
        const BW = TILE * 2
        const BH = TILE * 2
        const bx = px - TILE / 2
        const by = py - TILE / 2
        // Ambient glow (settlement warmth)
        ctx.fillStyle = 'rgba(255,215,110,0.18)'
        ctx.fillRect(bx - TILE, by - TILE, BW + TILE * 2, BH + TILE * 2)
        // Roof
        ctx.fillStyle = '#5a2e08'
        ctx.beginPath()
        ctx.moveTo(bx + BW / 2, by)
        ctx.lineTo(bx + BW,     by + BH * 0.44)
        ctx.lineTo(bx,          by + BH * 0.44)
        ctx.closePath()
        ctx.fill()
        // Walls
        ctx.fillStyle = '#b89060'
        ctx.fillRect(bx + 1, by + BH * 0.44, BW - 2, BH * 0.56 - 1)
        // Door
        ctx.fillStyle = '#2a1000'
        ctx.fillRect(bx + BW / 2 - 2, by + BH * 0.60, 4, BH * 0.36 - 1)
        // Windows
        ctx.fillStyle = 'rgba(255,230,140,0.60)'
        ctx.fillRect(bx + 3,       by + BH * 0.50, 3, 3)
        ctx.fillRect(bx + BW - 6,  by + BH * 0.50, 3, 3)
      }
    }
  }

  // Settlement markers: draw a subtle ring around clusters of 3+ huts
  {
    const hutPositions: [number, number][] = []
    for (let row = 0; row < height; row++) {
      const tr = tiles[row]
      if (!tr) continue
      for (let col = 0; col < width; col++) {
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
          if (d2 < 64) { cluster.push(j); usedInCluster.add(j) }
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
        ctx.strokeStyle = `rgba(200,170,80,${Math.min(0.45, 0.20 + cluster.length * 0.04)})`
        ctx.lineWidth = 1.2
        ctx.setLineDash([4, 3])
        ctx.beginPath(); ctx.arc(px2, py2, r2, 0, Math.PI * 2); ctx.stroke()
        ctx.setLineDash([])
        // Town hall icon for large settlements (5+ huts)
        if (cluster.length >= 5) {
          const TH = TILE * 3.5 // town hall icon size
          const tx = px2 - TH / 2; const ty = py2 - TH / 2
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
          ctx.closePath(); ctx.fill()
          // Central tower
          const tw = TH * 0.22; const th2 = TH * 0.85
          ctx.fillStyle = '#c0a870'
          ctx.fillRect(px2 - tw / 2, ty - th2 * 0.20, tw, th2 * 0.65)
          ctx.fillStyle = '#6a3820'
          ctx.beginPath()
          ctx.moveTo(px2, ty - th2 * 0.28)
          ctx.lineTo(px2 + tw / 2 + 1, ty - th2 * 0.20)
          ctx.lineTo(px2 - tw / 2 - 1, ty - th2 * 0.20)
          ctx.closePath(); ctx.fill()
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
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const s = structure[row][col]
        if (s < 0.05) continue
        const t = tiles[row][col]
        if (t === 8) continue
        const px = col * TILE
        const py = row * TILE
        const alpha = Math.min(0.95, 0.4 + s * 0.55)
        if (TILE >= 8) {
          const cx2 = px + TILE / 2
          if (s >= 0.70) {
            ctx.fillStyle = `rgba(120,90,60,${0.6 + s * 0.3})`
            ctx.fillRect(px + 1, py + TILE * 0.5, TILE - 2, TILE * 0.5 - 1)
            ctx.fillStyle = `rgba(90,70,50,${0.7 + s * 0.25})`
            ctx.beginPath()
            ctx.moveTo(cx2, py + 2); ctx.lineTo(px + TILE - 2, py + TILE * 0.52); ctx.lineTo(px + 2, py + TILE * 0.52)
            ctx.closePath(); ctx.fill()
            ctx.fillStyle = 'rgba(160,140,110,0.5)'
            ctx.fillRect(px + 2, py + TILE * 0.55, 3, 3)
            ctx.fillRect(px + TILE - 5, py + TILE * 0.65, 3, 3)
          } else if (s >= 0.35) {
            ctx.fillStyle = `rgba(100,65,30,${0.45 + s * 0.4})`
            ctx.fillRect(px + 2, py + TILE * 0.45, TILE - 4, TILE * 0.55 - 1)
            ctx.fillStyle = `rgba(80,50,20,${0.5 + s * 0.35})`
            ctx.beginPath()
            ctx.moveTo(cx2 - 1, py + 3); ctx.lineTo(px + TILE - 2, py + TILE * 0.47); ctx.lineTo(px + 2, py + TILE * 0.47)
            ctx.closePath(); ctx.fill()
          } else {
            ctx.fillStyle = `rgba(130,95,45,${s * 2.5})`
            ctx.fillRect(px + 1, py + TILE * 0.6, TILE - 2, TILE * 0.35)
          }
        } else {
          const r = s >= 0.70 ? 120 : s >= 0.35 ? 100 : 130
          const g = s >= 0.70 ? 90  : s >= 0.35 ? 65  : 95
          const b = s >= 0.70 ? 60  : s >= 0.35 ? 30  : 45
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
          ctx.fillRect(px, py, TILE, TILE)
        }
      }
    }
  }

  if (overlay === 'hazard' && world.grid.hazard) {
    const haz = world.grid.hazard
    for (let row = 0; row < height; row++) {
      const r = haz[row]
      if (!r) continue
      for (let col = 0; col < width; col++) {
        const v = r[col] ?? 0
        if (v < 0.05) continue
        ctx.fillStyle = `rgba(220,40,30,${Math.min(0.75, v * 0.9)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (overlay === 'fertility' && world.grid.fertility) {
    const fer = world.grid.fertility
    for (let row = 0; row < height; row++) {
      const r = fer[row]
      if (!r) continue
      for (let col = 0; col < width; col++) {
        const v = r[col] ?? 0
        if (v < 0.10) continue
        ctx.fillStyle = `rgba(80,200,80,${Math.min(0.55, v * 0.6)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (overlay === 'structures' && world.grid.structure) {
    const str = world.grid.structure
    for (let row = 0; row < height; row++) {
      const r = str[row]
      if (!r) continue
      for (let col = 0; col < width; col++) {
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
    for (let row = 0; row < height; row++) {
      const fr = ft?.[row]
      const wr = wt?.[row]
      const pr = pt?.[row]
      for (let col = 0; col < width; col++) {
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
      const tx = Math.round(org.x - ox), ty = Math.round(org.y - oy)
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = tx + dx, ny = ty + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const idx = ny * width + nx
          sum[idx] += org.age
          cnt[idx] += 1
        }
      }
    }
    for (let row = 0; row < height; row++) {
      const rowBase = row * width
      for (let col = 0; col < width; col++) {
        const idx = rowBase + col
        const c = cnt[idx]
        if (c === 0) continue
        const t = Math.min(1, (sum[idx] / c) / 3000)
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
      if (!org.alive || (org.fear_level ?? 0) < 0.30) continue
      const tx = Math.round(org.x - ox), ty = Math.round(org.y - oy)
      const R = 3
      const f = org.fear_level ?? 0
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.abs(dx) + Math.abs(dy)
          if (d > R) continue
          const nx = tx + dx, ny = ty + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          heat[ny * width + nx] += f * (R - d + 1) / (R + 1)
        }
      }
    }
    for (let row = 0; row < height; row++) {
      const rowBase = row * width
      for (let col = 0; col < width; col++) {
        const v = heat[rowBase + col]
        if (v < 0.15) continue
        const t = Math.min(1, v / 2)
        ctx.fillStyle = `rgba(255,${Math.round(140 - t * 100)},${Math.round(60 - t * 40)},${(0.30 + t * 0.40).toFixed(2)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (overlay === 'density') {
    const n = height * width
    const grid2d = scratchA(n)
    for (const org of organisms) {
      if (!org.alive) continue
      const tx2 = Math.round(org.x - ox), ty2 = Math.round(org.y - oy)
      const R = 4
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.abs(dx) + Math.abs(dy)
          if (d > R) continue
          const nx = tx2 + dx, ny = ty2 + dy
          if (nx >= 0 && ny >= 0 && ny < height && nx < width) {
            grid2d[ny * width + nx] += (R - d + 1)
          }
        }
      }
    }
    let maxD = 1
    for (let k = 0; k < n; k++) if (grid2d[k] > maxD) maxD = grid2d[k]
    for (let row = 0; row < height; row++) {
      const rowBase = row * width
      for (let col = 0; col < width; col++) {
        const v = grid2d[rowBase + col]
        if (v < 1) continue
        const t2 = Math.min(v / maxD, 1)
        ctx.fillStyle = `rgba(${Math.round(80 + t2 * 175)},${Math.round(200 - t2 * 100)},${Math.round(255 - t2 * 200)},${0.25 + t2 * 0.45})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  const liveOrgs = organisms.filter(o => o.alive && o.lineage_id)
  if (viewFlags.territory && liveOrgs.length > 0) {
    const BLOCK = 4
    const MAX_DIST_SQ = 40 * 40
    const bw = Math.ceil(width  / BLOCK)
    const bh = Math.ceil(height / BLOCK)
    const orgData = liveOrgs.map(o => {
      const hsl = lineageColor(o.lineage_id)
      const dark = hsl.replace(/(\d+)%\)$/, (_, l) => `${Math.max(15, Number(l) - 30)}%, 0.85)`)
        .replace('hsl(', 'hsla(')
      return {
        tx:     o.x - ox,
        ty:     o.y - oy,
        lid:    o.lineage_id,
        fill:   hsl.replace('hsl(', 'hsla(').replace(')', ', 0.25)'),
        border: dark,
      }
    })

    const ownerLid:    (string | null)[][] = Array.from({ length: bh }, () => new Array(bw).fill(null))
    const ownerFill:   (string | null)[][] = Array.from({ length: bh }, () => new Array(bw).fill(null))
    const ownerBorder: (string | null)[][] = Array.from({ length: bh }, () => new Array(bw).fill(null))
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        const cx2 = bx * BLOCK + BLOCK * 0.5
        const cy2 = by * BLOCK + BLOCK * 0.5
        if (tiles[Math.floor(cy2)]?.[Math.floor(cx2)] === 2) continue
        let bestLid = '', bestFill = '', bestBorder = '', bestDist = MAX_DIST_SQ
        for (const od of orgData) {
          const d = (od.tx - cx2) ** 2 + (od.ty - cy2) ** 2
          if (d < bestDist) { bestDist = d; bestLid = od.lid; bestFill = od.fill; bestBorder = od.border }
        }
        if (bestLid) {
          ownerLid[by][bx]    = bestLid
          ownerFill[by][bx]   = bestFill
          ownerBorder[by][bx] = bestBorder
        }
      }
    }

    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        const fill = ownerFill[by][bx]
        if (!fill) continue
        ctx.fillStyle = fill
        ctx.fillRect(bx * BLOCK * TILE, by * BLOCK * TILE, BLOCK * TILE, BLOCK * TILE)
      }
    }

    const BW = 2
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        const lid    = ownerLid[by][bx]
        const border = ownerBorder[by][bx]
        if (!lid || !border) continue
        const px = bx * BLOCK * TILE, py = by * BLOCK * TILE
        const sz = BLOCK * TILE
        const top    = by > 0      ? ownerLid[by-1][bx] : null
        const bottom = by < bh - 1 ? ownerLid[by+1][bx] : null
        const left   = bx > 0      ? ownerLid[by][bx-1] : null
        const right  = bx < bw - 1 ? ownerLid[by][bx+1] : null
        if (top !== lid || bottom !== lid || left !== lid || right !== lid) {
          ctx.fillStyle = border
          if (top    !== lid) ctx.fillRect(px,           py,           sz, BW)
          if (bottom !== lid) ctx.fillRect(px,           py + sz - BW, sz, BW)
          if (left   !== lid) ctx.fillRect(px,           py,           BW, sz)
          if (right  !== lid) ctx.fillRect(px + sz - BW, py,           BW, sz)
        }
      }
    }
  }

  {
    const phase = world.day_progress
    const smoothstep = (t: number) => t * t * (3 - 2 * t)

    let darkness = 0
    if (phase >= 0.55 && phase < 0.80) {
      darkness = 0.85 * smoothstep((phase - 0.55) / 0.25)
    } else if (phase >= 0.80 && phase < 0.95) {
      darkness = 0.85
    } else if (phase >= 0.95) {
      darkness = 0.85 * (1 - smoothstep((phase - 0.95) / 0.10))
    } else if (phase < 0.05) {
      darkness = 0.85 * (1 - smoothstep((phase + 0.05) / 0.10))
    }

    const gauss = (d: number, sigma: number) =>
      Math.exp(-(d * d) / (2 * sigma * sigma))

    const sunsetDist = Math.abs(phase - 0.67)
    let dawnDist     = Math.abs(phase - 0.0)
    dawnDist         = Math.min(dawnDist, 1 - dawnDist)
    const warm = Math.max(gauss(sunsetDist, 0.06), gauss(dawnDist, 0.04))

    if (warm > 0.01) {
      ctx.fillStyle = `rgba(255, 100, 40, ${warm * 0.20})`
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
    const streakOpacity = weather.intensity * (isStorm ? 0.75 : 0.50)
    const animOffset    = (t / (isStorm ? 40 : 65)) % streakSpacing
    ctx.save()
    ctx.strokeStyle = `rgba(170,210,255,${streakOpacity})`
    ctx.lineWidth   = isStorm ? 1.2 : 0.7
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
        const a = 0.15 + 0.70 * (i / samples.length)
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
    for (let row = 0; row < height; row++) {
      const r = fertility[row]
      if (!r) continue
      for (let col = 0; col < width; col++) {
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
    for (let row = 0; row < height; row++) {
      const r = hazard[row]
      if (!r) continue
      for (let col = 0; col < width; col++) {
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
    for (let row = 0; row < height; row++) {
      const pr = path_trail[row]
      if (!pr) continue
      for (let col = 0; col < width; col++) {
        const p = pr[col] ?? 0
        if (p < 0.55) continue
        ctx.fillStyle = `rgba(160,130,80,${Math.min(0.28, p * 0.30)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
    ctx.restore()
  }

  if (viewFlags.trails && (food_trail || water_trail || path_trail)) {
    ctx.save()
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const f = food_trail?.[row]?.[col] ?? 0
        const w = water_trail?.[row]?.[col] ?? 0
        const p = path_trail?.[row]?.[col] ?? 0
        if (f < 0.1 && w < 0.1 && p < 0.1) continue
        if (p >= 0.1) {
          ctx.fillStyle = `rgba(220,220,220,${Math.min(0.35, p * 0.5)})`
          ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
        }
        if (f >= 0.1) {
          ctx.fillStyle = `rgba(240,220,80,${Math.min(0.40, f * 0.5)})`
          ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
        }
        if (w >= 0.1) {
          ctx.fillStyle = `rgba(100,170,240,${Math.min(0.40, w * 0.5)})`
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
    for (let row = 0; row < height; row++) {
      const r = structure[row]
      if (!r) continue
      for (let col = 0; col < width; col++) {
        if (r[col] && r[col] > 0.1) {
          ctx.strokeRect(col * TILE + 0.5, row * TILE + 0.5, TILE - 1, TILE - 1)
        }
      }
    }
    ctx.restore()
  }

  if (viewFlags.partners) {
    const byId = new Map(organisms.filter(o => o.alive).map(o => [o.id, o]))
    ctx.save()
    ctx.strokeStyle = 'rgba(255,170,200,0.55)'
    ctx.lineWidth = 1
    for (const org of organisms) {
      if (!org.alive || !org.partner_id) continue
      if (org.id >= org.partner_id) continue
      const partner = byId.get(org.partner_id)
      if (!partner || !partner.alive) continue
      const ax = (org.x - ox) * TILE + TILE / 2
      const ay = (org.y - oy) * TILE + TILE / 2
      const bx = (partner.x - ox) * TILE + TILE / 2
      const by = (partner.y - oy) * TILE + TILE / 2
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
      ctx.stroke()
    }
    ctx.restore()
  }

  for (const animal of (viewFlags.animals ? animals : [])) {
    const px = (animal.x - ox) * TILE
    const py = (animal.y - oy) * TILE
    const tile = pickAnimalTile(animal.kind, animal.id)
    const aSize = animal.kind === 'fish' ? 10 : 14
    const yBase = animal.kind === 'fish' ? -1 : -3
    const speed   = animal.kind === 'fish' ? 0.0028
                  : animal.kind === 'bird' ? 0.0050
                  : animal.kind === 'wolf' || animal.kind === 'dog' ? 0.0042
                  : 0.0036
    const amp     = animal.kind === 'fish' ? 1.4 : 0.8
    const phase   = (t * speed) + (animal.id * 0.7)
    const yOff    = yBase + Math.sin(phase) * amp
    if (ATLAS_CREATURE.complete) {
      drawTile(ctx, ATLAS_CREATURE, tile, px - aSize / 2 + TILE / 2, py + yOff, aSize)
    } else {
      const cx = px + TILE / 2; const cy = py + TILE / 2
      const r  = animal.kind === 'rabbit' || animal.kind === 'bird' ? 2.2
               : animal.kind === 'fish' ? 2.0
               : 3.2
      const c  = animal.kind === 'wolf' ? '#999' : animal.kind === 'dog' ? '#dca070'
               : animal.kind === 'fish' ? '#5a9090' : animal.kind === 'bird' ? '#b070b0'
               : animal.kind === 'boar' ? '#5a3a20' : '#7a4e28'
      ctx.fillStyle = c
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
    }
  }

  const isFocused = (org: WorldState['organisms'][0]) => {
    if (focus === 'all') return true
    if (focus === 'sick')     return org.infection > 0.15
    if (focus === 'hungry')   return org.energy < 0.3
    if (focus === 'elders')   return !!org.is_elder
    if (focus === 'builders') return !!(org.discoveries ?? []).some(d => ['shelter','fire','masonry','stone_tools','spear'].includes(d))
    if (focus === 'thriving') return org.energy > 0.8 && org.hydration > 0.8
    return true
  }

  for (const org of organisms) {
    if (!org.alive) continue
    // Hide organisms inside their home (resting/sleeping at home position)
    {
      const th = (org.thought || '').toLowerCase()
      const resting = th.includes('rest') || th.includes('sleep') || th.includes('nap')
        || th.includes('meditat') || th.includes('daydream') || th.includes('reflecting')
        || th.includes('sheltering') || th.includes('returning home') || th.includes('settling in')
      if (resting && org.home_x && org.home_y) {
        const ddx = org.x - org.home_x; const ddy = org.y - org.home_y
        if (ddx * ddx + ddy * ddy < 2.0) continue
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
      ctx.strokeStyle = (org.thought.includes('!') || org.thought === 'sounding alarm')
        ? 'rgba(255,68,136,0.6)' : 'rgba(255,255,68,0.6)'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 2); ctx.stroke()
    } else if (org.thought === 'challenging' || org.thought === 'challenging alone') {
      ctx.strokeStyle = org.thought === 'challenging' ? 'rgba(255,34,0,0.85)' : 'rgba(204,68,34,0.7)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(px, py - 11); ctx.lineTo(px + 11, py)
      ctx.lineTo(px, py + 11); ctx.lineTo(px - 11, py)
      ctx.closePath(); ctx.stroke()
    }

    if (org.infection > 0.15) {
      ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(187,255,68,${org.infection * 0.3})`
      ctx.fill()
    }

    if (org.is_elder) {
      ctx.strokeStyle = 'rgba(255,220,80,0.85)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 2])
      ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
    }

    if (org.id === selectedOrgId) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 2])
      ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
    }

    if (org.lineage_id) {
      ctx.strokeStyle = lineageColor(org.lineage_id)
      ctx.lineWidth = org.traits ? 1 + org.traits.resilience * 2 : 2
      ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.stroke()
    }

    if (org.carrying > 0) {
      ctx.fillStyle = org.carrying_type === 2 ? '#9a9a9a' : '#8b5e3c'
      ctx.fillRect(px - 3, py - 13, 6, 4)
    }

    const variant = orgVariant(org.id)
    const bodyR = variant.bodyRadius * (org.sex === 'male' ? 1.05 : 0.95)

    let bodyFill = THOUGHT_COLORS[org.thought] ?? '#cccccc'
    if (viewFlags.health) {
      const h = Math.max(0, Math.min(1, org.health))
      const r = Math.round(220 * (1 - h) + 80 * h)
      const g = Math.round( 80 * (1 - h) + 200 * h)
      const b = Math.round( 80 * (1 - h) + 100 * h)
      bodyFill = `rgb(${r},${g},${b})`
    } else if (viewFlags.age) {
      if (org.is_elder) bodyFill = '#e9c87a'
      else if (org.age < 900) bodyFill = '#8db5d6'
      else bodyFill = '#b8b8a8'
    }
    ctx.fillStyle = bodyFill
    ctx.beginPath(); ctx.arc(px, py, bodyR, 0, Math.PI * 2); ctx.fill()

    if (viewFlags.fear && (org.fear_level ?? 0) > 0.25) {
      const fa = Math.min(0.55, (org.fear_level ?? 0) * 0.8)
      ctx.beginPath(); ctx.arc(px, py, bodyR + 4, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(220,70,70,${fa})`
      ctx.fill()
    }

    if (viewFlags.lineageDot && org.lineage_id) {
      ctx.fillStyle = lineageColor(org.lineage_id)
      ctx.beginPath(); ctx.arc(px, py + bodyR * 0.4, 1.6, 0, Math.PI * 2); ctx.fill()
    }

    if (viewFlags.pregnancy && org.pregnant) {
      ctx.strokeStyle = 'rgba(255,220,120,0.9)'
      ctx.lineWidth = 1.3
      ctx.setLineDash([2, 2])
      ctx.beginPath(); ctx.arc(px, py, bodyR + 2.5, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
    }

    ctx.fillStyle = variant.hairColor
    ctx.beginPath(); ctx.arc(px, py - bodyR * 0.7, bodyR * 0.55, 0, Math.PI * 2); ctx.fill()

    ctx.fillStyle = variant.accent
    ctx.fillRect(px - bodyR * 0.7, py + bodyR * 0.15, bodyR * 1.4, 1.4)

    const barW = TILE - 2
    const bx = (org.x - ox) * TILE + 1
    const by = (org.y - oy) * TILE
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by - 5, barW, 2)
    ctx.fillStyle = '#55dd55';          ctx.fillRect(bx, by - 5, barW * org.energy, 2)
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by - 2, barW, 2)
    ctx.fillStyle = '#4499ff';          ctx.fillRect(bx, by - 2, barW * org.hydration, 2)

    const isSelected = org.id === selectedOrgId
    const showName    = isSelected || viewFlags.names
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
    const text = `${fps.toFixed(0)} fps · ${organisms.filter(o => o.alive).length} org`
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
      ctx.beginPath(); ctx.moveTo(x * TILE, 0); ctx.lineTo(x * TILE, H); ctx.stroke()
    }
    for (let y = 0; y <= height; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * TILE); ctx.lineTo(W, y * TILE); ctx.stroke()
    }
  }
}

function WorldSprite({ world, interp, selectedOrgId, overlay, focus, viewFlags, onFirstDraw, atX, atY }: { world: WorldState; interp?: InterpRefs; selectedOrgId: string | null; overlay: string | null; focus: string; viewFlags: ViewFlags; onFirstDraw: () => void; atX: number; atY: number }) {
  useEntity()

  const W = world.grid.width  * TILE
  const H = world.grid.height * TILE
  const dyn = useDynamicCanvas(W, H)

  const hasDrawn   = useRef(false)
  const cachedDepth  = useRef<number[][] | null>(null)
  const cachedBiomes = useRef<number[][] | null>(null)
  const filledOnce   = useRef(false)

  useLayoutEffect(() => {
    if (filledOnce.current) return
    dyn.ctx.fillStyle = '#1a4a80'
    dyn.ctx.fillRect(0, 0, W, H)
    dyn.markDirty()
    filledOnce.current = true
  }, [dyn, W, H])

  const worldRef         = useRef<WorldState | null>(world)
  const selectedOrgIdRef = useRef<string | null>(selectedOrgId)
  const overlayRef       = useRef<string | null>(overlay)
  const focusRef         = useRef<string>(focus)
  const viewFlagsRef     = useRef<ViewFlags>(viewFlags)
  worldRef.current         = world
  selectedOrgIdRef.current = selectedOrgId
  overlayRef.current       = overlay
  focusRef.current         = focus
  viewFlagsRef.current     = viewFlags

  useEffect(() => {
    if (!interp) return
    let raf = 0
    let stopped = false
    let lastDrawnAt: number = 0
    let lastDrawnT:  number = -1
    let lastDrawnUI: string = ''

    const tick = () => {
      if (stopped) return
      raf = requestAnimationFrame(tick)

      const w = worldRef.current
      if (!w) return

      if (w.grid.depth_map) cachedDepth.current  = w.grid.depth_map  as number[][]
      if (w.grid.biomes)    cachedBiomes.current = w.grid.biomes     as number[][]

      const cur     = interp.current.current
      const prev    = interp.prev.current
      const curServerAt   = interp.currentServerAt.current
      const prevServerAt  = interp.prevServerAt.current
      const currentReceivedAt = interp.currentReceivedAt.current
      const slowMo = viewFlagsRef.current.slowMo
      const fastMo = viewFlagsRef.current.fastMo
      const speedDiv = slowMo ? 0.5 : fastMo ? 2.0 : 1.0
      const interval = Math.max(50, curServerAt - prevServerAt) / speedDiv
      const RENDER_LAG_MS = Math.min(120, interval * 0.5)
      const PREDICT_CAP = 2.0
      const t = (cur && prev && interval > 0)
        ? Math.max(0, Math.min(PREDICT_CAP, (performance.now() - currentReceivedAt - RENDER_LAG_MS) / interval))
        : 1

      const uiKey = `${selectedOrgIdRef.current ?? ''}|${overlayRef.current ?? ''}|${focusRef.current}|${viewFlagsRef.current.territory ? 't':''}${viewFlagsRef.current.names ? 'n':''}${viewFlagsRef.current.thoughts ? 'h':''}${viewFlagsRef.current.animals ? 'a':''}${viewFlagsRef.current.grid ? 'g':''}`
      const settled = t >= PREDICT_CAP && lastDrawnT >= PREDICT_CAP && curServerAt === lastDrawnAt && uiKey === lastDrawnUI
      if (settled) return

      let renderOrgs = w.viewport_organisms ?? w.organisms
      if (prev && cur === w) {
        const prevOrgs = prev.viewport_organisms ?? prev.organisms
        const prevById = new Map<string, typeof prevOrgs[number]>()
        for (const o of prevOrgs) prevById.set(o.id, o)
        renderOrgs = renderOrgs.map(o => {
          const p = prevById.get(o.id)
          if (!p || !p.alive || !o.alive) return o
          return { ...o, x: p.x + (o.x - p.x) * t, y: p.y + (o.y - p.y) * t }
        })
      }
      let renderAnimals = w.viewport_animals ?? w.animals
      if (prev && cur === w) {
        const prevAnimals = prev.viewport_animals ?? prev.animals
        const prevById = new Map<number, typeof prevAnimals[number]>()
        for (const a of prevAnimals) prevById.set(a.id, a)
        renderAnimals = renderAnimals.map(a => {
          const p = prevById.get(a.id)
          if (!p) return a
          return { ...a, x: p.x + (a.x - p.x) * t, y: p.y + (a.y - p.y) * t }
        })
      }

      const lerpCycle = (a: number, b: number, k: number) => {
        let diff = b - a
        if (diff >  0.5) diff -= 1
        if (diff < -0.5) diff += 1
        const out = a + diff * k
        return (out % 1 + 1) % 1
      }
      const lerpedDay    = prev
        ? lerpCycle(prev.day_progress, w.day_progress, t)
        : w.day_progress
      const lerpedSeason = prev
        ? lerpCycle(prev.season_progress, w.season_progress, t)
        : w.season_progress

      const enrichedGrid = {
        ...w.grid,
        depth_map: cachedDepth.current  ?? w.grid.depth_map,
        biomes:    cachedBiomes.current ?? w.grid.biomes,
      }
      const enrichedWorld: WorldState = {
        ...w,
        grid:               enrichedGrid,
        viewport_organisms: renderOrgs,
        viewport_animals:   renderAnimals,
        day_progress:       lerpedDay,
        season_progress:    lerpedSeason,
      }

      drawWorldOnCanvas(dyn.ctx, enrichedWorld, selectedOrgIdRef.current, overlayRef.current, focusRef.current, viewFlagsRef.current)
      dyn.markDirty()

      lastDrawnAt = curServerAt
      lastDrawnT  = t
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
  }, [interp, dyn, onFirstDraw])

  return (
    <>
      <Transform x={atX} y={atY} />
      <Sprite
        width={W}
        height={H}
        dynamicSrc={dyn.id}
        color="#ffffff"
        zIndex={0}
      />
    </>
  )
}

function CameraController({
  worldW, worldH, containerW, containerH,
  containerEl, cameraStateRef, followTarget,
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const prevFollowRef = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!followTarget) return
    const prev = prevFollowRef.current
    const isNewTarget = !prev
      || Math.abs(prev.x - followTarget.x) > 30
      || Math.abs(prev.y - followTarget.y) > 30
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
    const onUp = () => { drag.current.active = false }
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
  }, [camera, containerEl, containerW, containerH, worldW, worldH])

  const clampCam = useRef<((x: number, y: number, zoom: number) => { x: number; y: number }) | null>(null)
  clampCam.current = (x, y, zoom) => {
    const halfW = containerW / (2 * zoom)
    const halfH = containerH / (2 * zoom)
    const cx = halfW >= worldW / 2 ? x : Math.max(halfW, Math.min(worldW - halfW, x))
    const cy = halfH >= worldH / 2 ? y : Math.max(halfH, Math.min(worldH - halfH, y))
    return { x: cx, y: cy }
  }

  useGestures({
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
  }, { target: containerEl })

  return null
}

interface Props {
  world: WorldState
  interp?: InterpRefs
}

export function WorldView({ world, interp }: Props) {
  const selectedOrgId = useUIStore(s => s.selectedOrgId)
  const followOrgId   = useUIStore(s => s.followOrgId)
  const overlay       = useUIStore(s => s.overlay)
  const focus         = useUIStore(s => s.focus)
  const viewFlags     = useUIStore(s => s.viewFlags)
  const onOrgSelect   = useUIStore(s => s.selectOrg)
  const W = world.grid.width * TILE
  const H = world.grid.height * TILE
  const cx = W / 2
  const cy = H / 2

  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0

  const containerRef   = useRef<HTMLDivElement>(null)
  const cameraStateRef = useRef({ x: cx, y: cy, zoom: 1.5 })
  const [dims, setDims] = useState({ w: 0, h: 0 })
  const [mapReady, setMapReady] = useState(false)

  const followTarget = followOrgId
    ? (() => {
        const org = world.organisms.find(o => o.id === followOrgId && o.alive)
        return org ? { x: (org.x - ox) * TILE, y: (org.y - oy) * TILE } : null
      })()
    : null

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const { x: camX, y: camY, zoom } = cameraStateRef.current
    const canvasTileX = (camX + (sx - dims.w / 2) / zoom) / TILE
    const canvasTileY = (camY + (sy - dims.h / 2) / zoom) / TILE
    const worldX = canvasTileX + ox
    const worldY = canvasTileY + oy

    let nearest: string | null = null
    let nearestDist = 3.0
    for (const org of (world.viewport_organisms ?? world.organisms)) {
      if (!org.alive) continue
      const d = Math.abs(org.x - worldX) + Math.abs(org.y - worldY)
      if (d < nearestDist) { nearestDist = d; nearest = org.id }
    }
    onOrgSelect(nearest)
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
      style={{ flex: 1, minWidth: 0, overflow: 'hidden', cursor: 'grab', position: 'relative' }}
      onClick={handleClick}
    >
      <div style={{
        position: 'absolute', inset: 0, background: '#1a4a80', zIndex: 10,
        pointerEvents: 'none',
        opacity: mapReady ? 0 : 1,
        transition: 'opacity 280ms ease-out',
      }} />
      {dims.w > 0 && (
        <Game
          gravity={0}
          width={dims.w}
          height={dims.h}
          style={{ display: 'block' }}
        >
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
