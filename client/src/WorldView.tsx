import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Game, World, Entity, Transform, Sprite, Camera2D, useCamera, useGame, useEntity } from 'cubeforge'
import type { WorldState } from './types'
import type { InterpRefs } from './useSimulation'
import { useUIStore } from './store'
import { lineageColor } from './constants'
import { SPRITE, ATLAS_TOWN, ATLAS_CREATURE, drawTile, onAnyAtlasLoaded } from './sprites'

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
  7: '#cc6600',   // campfire base
  8: '#8b6914',   // hut
  9: '#3a6688',   // flooded - steel blue
  10: '#c8a020',  // mineral - gold/amber
  11: '#2a2018',  // scorched - very dark brown
  12: '#ddeef5',  // snow - icy blue-white
  13: '#d9c07a',  // sand - warm desert tan
}

const BIOME_OVERLAYS: Record<number, string> = {
  0: 'rgba(80,140,60,0.08)',    // grassland
  1: 'rgba(20,80,20,0.14)',     // forest
  2: 'rgba(200,160,60,0.28)',   // desert - warm sand tint
  3: 'rgba(20,100,100,0.10)',   // wetland
  4: 'rgba(200,230,255,0.10)',  // tundra - subtle cold tint (snow/rock handle the look)
  5: 'rgba(160,40,20,0.18)',    // volcanic
}

// ── Pre-computed pixel-level lookup tables (avoid CSS parsing per tile) ───────
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

// tile_id → [r, g, b]
const TILE_RGB: Record<number, [number,number,number]> =
  Object.fromEntries(Object.entries(TILE_COLORS).map(([k,v]) => [+k, parseHex(v)]))

// biome_id → [r, g, b, a(0-1)]
const BIOME_RGBA: Record<number, [number,number,number,number]> =
  Object.fromEntries(Object.entries(BIOME_OVERLAYS).map(([k,v]) => [+k, parseRgbaStr(v)]))

// Module-level reusable ImageData buffer - allocate once, write every frame
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
  for (let row = 0; row < height; row++) {
    const tileRow  = tiles[row]
    const biomeRow = biomes?.[row]
    const depthRow = depth_map?.[row]
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

      const bx = col * TILE, by = row * TILE
      for (let ty = 0; ty < TILE; ty++) {
        let pi = ((by + ty) * W + bx) * 4
        for (let tx = 0; tx < TILE; tx++, pi += 4) {
          d[pi] = r; d[pi+1] = g; d[pi+2] = b; d[pi+3] = 255
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
}

/** Draw a single cloud puff: a row of overlapping circles along the base + bumps on top. */
function drawCloudShape(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  cloudW: number, cloudH: number,
  alpha: number,
  color: string,
  bumpSeed: number,
) {
  ctx.fillStyle = `rgba(${color},${alpha})`

  // Base body - flat-bottomed ellipse
  ctx.beginPath()
  ctx.ellipse(cx, cy + cloudH * 0.1, cloudW, cloudH * 0.65, 0, 0, Math.PI * 2)
  ctx.fill()

  // Bumps along the top - 4–6 overlapping circles of varying height & width
  const nBumps = 4 + (bumpSeed % 3)
  for (let b = 0; b < nBumps; b++) {
    const t   = b / (nBumps - 1)          // 0..1 across the cloud width
    const bx  = cx + (t - 0.5) * cloudW * 1.6
    // height varies per bump using a deterministic pseudo-random offset
    const h   = 0.5 + 0.45 * Math.abs(Math.sin(b * 2.1 + bumpSeed * 0.7))
    const by  = cy - cloudH * (0.3 + h * 0.55)
    const br  = cloudH * (0.45 + 0.35 * Math.abs(Math.sin(b * 1.5 + bumpSeed)))
    ctx.beginPath()
    ctx.arc(bx, by, br, 0, Math.PI * 2)
    ctx.fill()
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

  // Poisson-disc-style placement. Each candidate tile that passes the
  // probability roll is rejected if any tree already lives within
  // min_spacing tiles. Result: organic clusters with empty meadows
  // between them, instead of a uniform-noise blanket.
  const placed: Uint8Array = new Uint8Array(width * height)
  const order: number[] = []
  for (let i = 0; i < width * height; i++) order.push(i)
  // Hash-shuffle the order so nearby tiles aren't consistently winning
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
      case BIOME_FOREST:   chance = 0.55; spacing = 1; break
      case BIOME_WETLAND:  chance = 0.30; spacing = 2; break
      case BIOME_GRASS:    chance = 0.14; spacing = 3; break
      case BIOME_TUNDRA:   chance = 0.18; spacing = 3; break
      case BIOME_DESERT:   chance = 0.06; spacing = 4; break
      case BIOME_VOLCANIC: chance = 0.10; spacing = 3; break
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
    const seed   = (i + 1) * 137          // integer seed - avoids float-modulo always hitting 0
    const baseX  = ((seed * 73)  % 1000) / 1000 * W
    // Spread clouds across full height; storm clouds skew lower (more coverage)
    const baseY  = isStorm
      ? (((seed * 41)  % 750)  / 750  * 0.75 + 0.10) * H
      : (((seed * 41)  % 600)  / 600  * 0.60 + 0.05) * H
    const speed  = 0.014 + (i % 5) * 0.006
    const cx     = ((baseX + t * speed) % (W + 360)) - 180
    const cy     = baseY

    const cloudW = W * (0.09 + (i % 4) * 0.055)
    const cloudH = cloudW * (0.28 + (i % 3) * 0.07)   // flatter than a circle
    // vary alpha slightly per cloud so they don't all look identical
    const alpha  = baseAlpha * (0.75 + 0.25 * ((i * 13 + 7) % 10) / 10)

    drawCloudShape(ctx, cx, cy, cloudW, cloudH, alpha, color, i * 7 + 3)

    // Storm: add a second darker underlayer for depth
    if (isStorm) {
      drawCloudShape(ctx, cx + cloudW * 0.08, cy + cloudH * 0.25,
        cloudW * 0.88, cloudH * 0.70,
        alpha * 0.55, '8,10,24', i * 5 + 11)
    }
  }
  ctx.restore()
}

type ViewFlags = { territory: boolean; names: boolean; thoughts: boolean; animals: boolean; grid: boolean }

function drawWorldOnCanvas(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  selectedOrgId: string | null,
  overlay: string | null,
  focus: string,
  viewFlags: ViewFlags,
) {
  const { width, height, tiles, fire_intensity, structure } = world.grid
  // Tiles arrive on tick 0 and every 5th tick - skip this frame if not yet received
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

  // Season sky tint (thin transparent pass over the already-drawn tiles)
  const seasonTints: Record<string, string> = {
    decline:  'rgba(180,110,30,0.07)',
    scarcity: 'rgba(90,60,30,0.11)',
    recovery: 'rgba(30,120,150,0.07)',
  }
  const skyTint = seasonTints[world.season]
  if (skyTint) { ctx.fillStyle = skyTint; ctx.fillRect(0, 0, W, H) }

  // ── Pass 2: Special tile visuals (fire glow, campfires, huts) ───────────────
  // Only iterates tiles that need extra rendering - typically <1% of tiles.
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const t = tiles[row][col]
      if (t !== 4 && t !== 7 && t !== 8) continue  // skip 99%+ of tiles
      const px = col * TILE
      const py = row * TILE

      // Fire glow
      if (t === 4 && fire_intensity) {
        const fi = fire_intensity[row][col]
        ctx.fillStyle = `rgba(255,120,0,${fi * 0.55})`
        ctx.fillRect(px, py, TILE, TILE)
      }

      // Campfire - warm amber glow + halo on neighboring tiles
      if (t === 7 && fire_intensity) {
        const fi = fire_intensity[row][col]
        ctx.fillStyle = `rgba(255,200,80,${fi * 0.7})`
        ctx.fillRect(px, py, TILE, TILE)
        ctx.fillStyle = `rgba(255,160,40,${fi * 0.12})`
        ctx.fillRect(px - TILE * 2, py - TILE * 2, TILE * 5, TILE * 5)
        if (TILE >= 8) {
          // detailed flame symbol only worth drawing at larger tile sizes
          const cx2 = px + TILE / 2
          ctx.fillStyle = `rgba(255,80,0,${fi * 0.6})`
          ctx.beginPath(); ctx.arc(cx2, py + TILE * 0.4, TILE * 0.18, 0, Math.PI * 2); ctx.fill()
        }
      }

      // Hut - flat fill at small TILE, detailed at large TILE
      if (t === 8) {
        ctx.fillStyle = 'rgba(255,220,120,0.18)'
        ctx.fillRect(px - TILE, py - TILE, TILE * 3, TILE * 3)
        if (TILE >= 8) {
          const cx2 = px + TILE / 2
          ctx.fillStyle = '#6b3a0a'
          ctx.beginPath()
          ctx.moveTo(cx2, py + 1)
          ctx.lineTo(px + TILE - 1, py + TILE * 0.55)
          ctx.lineTo(px + 1,        py + TILE * 0.55)
          ctx.closePath()
          ctx.fill()
          ctx.fillStyle = '#c8a060'
          ctx.fillRect(px + 2, py + TILE * 0.55, TILE - 4, TILE * 0.45 - 1)
          ctx.fillStyle = '#3a1a00'
          ctx.fillRect(cx2 - 1, py + TILE * 0.7, 3, TILE * 0.3 - 1)
        } else {
          // simple hut mark - bright spot
          ctx.fillStyle = '#c8a060'
          ctx.fillRect(px, py, TILE, TILE)
        }
      }
    }
  }

  // Structure tier overlay - renders progressive building stages below the Hut tile level
  if (structure) {
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const s = structure[row][col]
        if (s < 0.05) continue
        const t = tiles[row][col]
        if (t === 8) continue  // Hut tile already drawn above
        const px = col * TILE
        const py = row * TILE
        const alpha = Math.min(0.95, 0.4 + s * 0.55)
        if (TILE >= 8) {
          // Detailed sub-tile drawing - only worth it at larger tile sizes
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
          // Small TILE: flat tint scaled by construction progress
          const r = s >= 0.70 ? 120 : s >= 0.35 ? 100 : 130
          const g = s >= 0.70 ? 90  : s >= 0.35 ? 65  : 95
          const b = s >= 0.70 ? 60  : s >= 0.35 ? 30  : 45
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
          ctx.fillRect(px, py, TILE, TILE)
        }
      }
    }
  }

  // World memory overlays
  if (overlay === 'density') {
    // Population density - compute from organism positions (offset to viewport coords)
    const grid2d: number[][] = Array.from({ length: height }, () => new Array(width).fill(0))
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
            grid2d[ny][nx] += (R - d + 1)
          }
        }
      }
    }
    const maxD = grid2d.reduce((m, row) => row.reduce((m2, v) => v > m2 ? v : m2, m), 1)
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const v = grid2d[row][col]
        if (v < 1) continue
        const t2 = Math.min(v / maxD, 1)
        ctx.fillStyle = `rgba(${Math.round(80 + t2 * 175)},${Math.round(200 - t2 * 100)},${Math.round(255 - t2 * 200)},${0.25 + t2 * 0.45})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  // Territory Voronoi overlay - each coarse block colored by nearest organism's lineage
  // Only colors land tiles within MAX_DIST tiles of any organism - ocean stays uncolored
  const liveOrgs = organisms.filter(o => o.alive && o.lineage_id)
  if (viewFlags.territory && liveOrgs.length > 0) {
    const BLOCK = 4
    const MAX_DIST_SQ = 40 * 40
    const bw = Math.ceil(width  / BLOCK)
    const bh = Math.ceil(height / BLOCK)
    const orgData = liveOrgs.map(o => {
      // e.g. "hsl(120, 90%, 75%)" → fill at 40% alpha, border at same hue/sat but 30pts darker
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

    // Pass 1: compute ownership grid
    const ownerLid:    (string | null)[][] = Array.from({ length: bh }, () => new Array(bw).fill(null))
    const ownerFill:   (string | null)[][] = Array.from({ length: bh }, () => new Array(bw).fill(null))
    const ownerBorder: (string | null)[][] = Array.from({ length: bh }, () => new Array(bw).fill(null))
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        const cx2 = bx * BLOCK + BLOCK * 0.5
        const cy2 = by * BLOCK + BLOCK * 0.5
        if (tiles[Math.floor(cy2)]?.[Math.floor(cx2)] === 2) continue  // skip water
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

    // Pass 2: draw fills
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        const fill = ownerFill[by][bx]
        if (!fill) continue
        ctx.fillStyle = fill
        ctx.fillRect(bx * BLOCK * TILE, by * BLOCK * TILE, BLOCK * TILE, BLOCK * TILE)
      }
    }

    // Pass 3: draw darkened border strips using the tribe's own darker shade
    const BW = 2  // border width in pixels
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

  // Night overlay
  if (!world.is_day) {
    const phase = world.day_progress
    const nightDepth = Math.sin(Math.PI * (phase - 0.7) / 0.3)
    ctx.fillStyle = `rgba(0,0,40,${0.38 * nightDepth})`
    ctx.fillRect(0, 0, W, H)
  }

  // Weather - clouds + rain streaks
  const weather = world.weather
  drawClouds(ctx, W, H, weather, t)
  if (weather && weather.kind !== 'clear') {
    const isStorm = weather.kind === 'storm'
    // Tint
    const tintAlpha = weather.intensity * (isStorm ? 0.38 : 0.22)
    ctx.fillStyle = isStorm ? `rgba(18,28,60,${tintAlpha})` : `rgba(45,90,170,${tintAlpha})`
    ctx.fillRect(0, 0, W, H)
    // Animated rain streaks - offset by time so they fall each frame
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

  // Draw animals (under organisms)
  for (const animal of (viewFlags.animals ? animals : [])) {
    const px = (animal.x - ox) * TILE
    const py = (animal.y - oy) * TILE
    const tile = SPRITE.animal[animal.kind as keyof typeof SPRITE.animal]
                 ?? SPRITE.animal.rabbit
    if (ATLAS_CREATURE.complete) {
      drawTile(ctx, ATLAS_CREATURE, tile, px - 3, py - 3, 14)
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

  // Focus filter helper
  const isFocused = (org: WorldState['organisms'][0]) => {
    if (focus === 'all') return true
    if (focus === 'sick')     return org.infection > 0.15
    if (focus === 'hungry')   return org.energy < 0.3
    if (focus === 'elders')   return !!org.is_elder
    if (focus === 'builders') return !!(org.discoveries ?? []).some(d => ['shelter','fire','masonry','stone_tools','spear'].includes(d))
    if (focus === 'thriving') return org.energy > 0.8 && org.hydration > 0.8
    return true
  }

  // Draw organisms (translate world coords to viewport canvas coords)
  for (const org of organisms) {
    if (!org.alive) continue
    const px = (org.x - ox) * TILE + TILE / 2
    const py = (org.y - oy) * TILE + TILE / 2
    const focused = isFocused(org)
    ctx.globalAlpha = focused ? 1 : 0.12

    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.beginPath()
    ctx.ellipse(px + 1, py + 3, 5, 3, 0, 0, Math.PI * 2)
    ctx.fill()

    // Signal / combat ring
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

    // Infection aura
    if (org.infection > 0.15) {
      ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(187,255,68,${org.infection * 0.3})`
      ctx.fill()
    }

    // Elder ring - oldest member of their lineage
    if (org.is_elder) {
      ctx.strokeStyle = 'rgba(255,220,80,0.85)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 2])
      ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
    }

    // Selection ring
    if (org.id === selectedOrgId) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 2])
      ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
    }

    // Lineage ring
    if (org.lineage_id) {
      ctx.strokeStyle = lineageColor(org.lineage_id)
      ctx.lineWidth = org.traits ? 1 + org.traits.resilience * 2 : 2
      ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.stroke()
    }

    // Carrying indicator - brown (wood) or gray (stone) square above body
    if (org.carrying > 0) {
      ctx.fillStyle = org.carrying_type === 2 ? '#9a9a9a' : '#8b5e3c'
      ctx.fillRect(px - 3, py - 13, 6, 4)
    }

    const variant = orgVariant(org.id)
    const bodyR = variant.bodyRadius * (org.sex === 'male' ? 1.05 : 0.95)

    ctx.fillStyle = THOUGHT_COLORS[org.thought] ?? '#cccccc'
    ctx.beginPath(); ctx.arc(px, py, bodyR, 0, Math.PI * 2); ctx.fill()

    ctx.fillStyle = variant.hairColor
    ctx.beginPath(); ctx.arc(px, py - bodyR * 0.7, bodyR * 0.55, 0, Math.PI * 2); ctx.fill()

    ctx.fillStyle = variant.accent
    ctx.fillRect(px - bodyR * 0.7, py + bodyR * 0.15, bodyR * 1.4, 1.4)

    // Energy + hydration bars
    const barW = TILE - 2
    const bx = (org.x - ox) * TILE + 1
    const by = (org.y - oy) * TILE
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by - 5, barW, 2)
    ctx.fillStyle = '#55dd55';          ctx.fillRect(bx, by - 5, barW * org.energy, 2)
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by - 2, barW, 2)
    ctx.fillStyle = '#4499ff';          ctx.fillRect(bx, by - 2, barW * org.hydration, 2)

    // Name
    if (viewFlags.names) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(org.name, px, py - 9)
    }

    // Thought
    if (viewFlags.thoughts && org.thought && org.thought !== 'observing') {
      ctx.fillStyle = 'rgba(180,220,255,0.7)'
      ctx.font = '8px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(org.thought, px, py - (viewFlags.names ? 18 : 9))
    }
  }
  ctx.globalAlpha = 1

  // Grid lines (optional)
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

// ── WorldTextureUpdater ───────────────────────────────────────────────────────
// Must be inside <Entity>. Injects a WebGL texture and updates it each tick.

function WorldTextureUpdater({ world, interp, selectedOrgId, overlay, focus, viewFlags, onFirstDraw }: { world: WorldState; interp?: InterpRefs; selectedOrgId: string | null; overlay: string | null; focus: string; viewFlags: ViewFlags; onFirstDraw: () => void }) {
  const engine = useGame()
  useEntity()
  const glTexRef   = useRef<WebGLTexture | null>(null)
  const offscreen  = useRef<HTMLCanvasElement | null>(null)
  const texKeyRef  = useRef<string>('')
  const initialised = useRef(false)
  const hasDrawn   = useRef(false)
  const needsFullReupload = useRef(false)
  // Cache the last-received static maps - depth_map/biomes only arrive every 30 ticks
  const cachedDepth  = useRef<number[][] | null>(null)
  const cachedBiomes = useRef<number[][] | null>(null)

  // Initialise texture once on mount - useLayoutEffect so the texture is injected
  // before Cubeforge's first WebGL frame, preventing the green placeholder flash.
  useLayoutEffect(() => {
    const rs = (engine as any).activeRenderSystem
    const gl: WebGL2RenderingContext = rs.gl

    // Determine the resolved URL key cubeforge will use for "world_canvas"
    const tmp = new Image()
    tmp.src = 'world_canvas'
    texKeyRef.current = tmp.src   // browser resolves to absolute URL

    // Create persistent GL texture
    const tex = gl.createTexture()!
    glTexRef.current = tex

    // Create offscreen canvas - pre-fill with ocean blue so first frame isn't a flash of green
    const W = world.grid.width * TILE
    const H = world.grid.height * TILE
    const cv = document.createElement('canvas')
    cv.width = W; cv.height = H
    const initCtx = cv.getContext('2d')!
    initCtx.fillStyle = '#1a4a80'
    initCtx.fillRect(0, 0, W, H)
    offscreen.current = cv

    // Initial upload - ocean-blue canvas so texture is valid and colour-matched from frame 1
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    // Inject into cubeforge's texture cache
    rs.textures.set(texKeyRef.current, tex)
    if (rs.touchTexture) rs.touchTexture(texKeyRef.current)

    initialised.current = true

    const onVisibility = () => {
      if (document.visibilityState === 'visible') needsFullReupload.current = true
    }
    document.addEventListener('visibilitychange', onVisibility)

    const cubeforgeCanvas = (rs as any).canvas as HTMLCanvasElement | undefined
    const onContextLost = (e: Event) => { e.preventDefault(); needsFullReupload.current = true }
    const onContextRestored = () => { needsFullReupload.current = true }
    cubeforgeCanvas?.addEventListener('webglcontextlost',     onContextLost)
    cubeforgeCanvas?.addEventListener('webglcontextrestored', onContextRestored)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      cubeforgeCanvas?.removeEventListener('webglcontextlost',     onContextLost)
      cubeforgeCanvas?.removeEventListener('webglcontextrestored', onContextRestored)
      try {
        const cleanGl: WebGL2RenderingContext = (engine as any).activeRenderSystem.gl
        if (glTexRef.current) { cleanGl.deleteTexture(glTexRef.current); glTexRef.current = null }
      } catch (_) {}
      offscreen.current    = null
      initialised.current  = false
      _imgBuf = null  // release module-level pixel buffer
      _baseCanvas = null
      _baseKey = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep latest world + UI state in refs so the RAF loop reads fresh values
  // without restarting on every state change (selecting an org, toggling overlay).
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

  // Continuous RAF render loop.
  //
  // Replaces the old "redraw whenever `world` prop changes" pattern. The loop
  // runs at the browser's refresh rate (~60 fps) DURING interpolation between
  // the previous and current WS snapshots. Once interpolation completes (t=1)
  // and no new snapshot has arrived, we stop redrawing - there's nothing new
  // on screen and another texSubImage2D would just re-upload the same 11.5 MB
  // texture for no reason.
  useEffect(() => {
    if (!interp) return
    let raf = 0
    let stopped = false
    // Track what we last drew so we can skip identical re-draws
    let lastDrawnAt: number = 0
    let lastDrawnT:  number = -1
    let lastDrawnUI: string = ''

    const tick = () => {
      if (stopped) return
      raf = requestAnimationFrame(tick)

      const w = worldRef.current
      if (!w || !initialised.current || !glTexRef.current || !offscreen.current) return
      const rs = (engine as any).activeRenderSystem
      if (!rs) return
      const gl: WebGL2RenderingContext = rs.gl

      // Cache depth_map / biomes when present (sent every 30 ticks)
      if (w.grid.depth_map) cachedDepth.current  = w.grid.depth_map  as number[][]
      if (w.grid.biomes)    cachedBiomes.current = w.grid.biomes     as number[][]

      // Compute interpolation factor from real-time elapsed since current snapshot
      const cur     = interp.current.current
      const prev    = interp.prev.current
      const curAt   = interp.currentAt.current
      const prevAt  = interp.prevAt.current
      const interval = Math.max(50, curAt - prevAt) // expected real-time gap, lower-bounded
      // t = 0 at curAt, 1 at curAt+interval. Clamps at 1 so we hold at `cur`
      // when the next snapshot is late instead of overshooting.
      const t = (cur && prev && interval > 0)
        ? Math.min(1, Math.max(0, (performance.now() - curAt) / interval))
        : 1

      const uiKey = `${selectedOrgIdRef.current ?? ''}|${overlayRef.current ?? ''}|${focusRef.current}|${viewFlagsRef.current.territory ? 't':''}${viewFlagsRef.current.names ? 'n':''}${viewFlagsRef.current.thoughts ? 'h':''}${viewFlagsRef.current.animals ? 'a':''}${viewFlagsRef.current.grid ? 'g':''}`
      const settled = t >= 1 && lastDrawnT >= 1 && curAt === lastDrawnAt && uiKey === lastDrawnUI
      if (settled && !needsFullReupload.current) return

      // Build an interpolated organism list. When prev exists and the org was
      // alive in both snapshots, lerp x/y. Births/deaths use the current pos as-is.
      let renderOrgs = w.viewport_organisms ?? w.organisms
      if (prev && t < 1 && cur === w) {
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
      if (prev && t < 1 && cur === w) {
        const prevAnimals = prev.viewport_animals ?? prev.animals
        const prevById = new Map<number, typeof prevAnimals[number]>()
        for (const a of prevAnimals) prevById.set(a.id, a)
        renderAnimals = renderAnimals.map(a => {
          const p = prevById.get(a.id)
          if (!p) return a
          return { ...a, x: p.x + (a.x - p.x) * t, y: p.y + (a.y - p.y) * t }
        })
      }

      const enrichedGrid = {
        ...w.grid,
        depth_map: cachedDepth.current  ?? w.grid.depth_map,
        biomes:    cachedBiomes.current ?? w.grid.biomes,
      }
      const enrichedWorld: WorldState = {
        ...w,
        grid:      enrichedGrid,
        viewport_organisms: renderOrgs,
        viewport_animals:   renderAnimals,
      }

      const ctx = offscreen.current.getContext('2d')!
      drawWorldOnCanvas(ctx, enrichedWorld, selectedOrgIdRef.current, overlayRef.current, focusRef.current, viewFlagsRef.current)

      gl.bindTexture(gl.TEXTURE_2D, glTexRef.current)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, offscreen.current)
      rs.textures.set(texKeyRef.current, glTexRef.current)
      if (rs.touchTexture) rs.touchTexture(texKeyRef.current)

      lastDrawnAt = curAt
      lastDrawnT  = t
      lastDrawnUI = uiKey

      if (!hasDrawn.current) {
        hasDrawn.current = true
        requestAnimationFrame(() => requestAnimationFrame(onFirstDraw))
      }
    }

    raf = requestAnimationFrame(tick)
    return () => { stopped = true; cancelAnimationFrame(raf) }
  }, [interp, engine, onFirstDraw])

  return null
}

// ── CameraController ──────────────────────────────────────────────────────────
// Must be inside <Game>. Handles mouse drag (pan) and scroll wheel (zoom).
// containerEl: the outer div - wheel/pointerdown scoped to it so sidebar scrolls freely.

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
  // Dynamic min zoom: never let the world shrink smaller than ~85% of "fit to screen"
  const minZoom = Math.min(containerW / worldW, containerH / worldH) * 0.85

  // cubeforge's Camera2D isn't wired to the engine until after its first tick,
  // so setPosition called synchronously in useLayoutEffect lands on a stub.
  // We retry every animation frame until the camera actually moves to the target.
  useEffect(() => {
    if (initialised.current) return
    const tx = worldW / 2
    const ty = worldH / 2
    // Fit world to container - start at fit zoom, never below dynamic min
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

  // Follow a target organism - pan to it AND zoom in so it fills the view
  const prevFollowRef = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!followTarget) return
    const prev = prevFollowRef.current
    // Zoom in when we first lock onto a new target (position changed significantly)
    const isNewTarget = !prev
      || Math.abs(prev.x - followTarget.x) > 30
      || Math.abs(prev.y - followTarget.y) > 30
    camera.setPosition(followTarget.x, followTarget.y)
    cameraStateRef.current.x = followTarget.x
    cameraStateRef.current.y = followTarget.y
    if (isNewTarget) {
      // Zoom to a comfortable close-up level (3.5× = clearly individual organism)
      const TRACK_ZOOM = 3.5
      camera.setZoom(TRACK_ZOOM)
      cameraStateRef.current.zoom = TRACK_ZOOM
    }
    prevFollowRef.current = { x: followTarget.x, y: followTarget.y }
  }, [followTarget, camera, cameraStateRef])

  useEffect(() => {
    if (!containerEl) return

    // Clamp camera center so the world always stays in view.
    // When fully zoomed out (world fits inside viewport) no clamping is needed -
    // the world is always visible regardless of camera position.
    // When zoomed in, keep the viewport from crossing world edges.
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
      // Re-clamp position since valid range changes with zoom
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

  return null
}

// ── WorldView ─────────────────────────────────────────────────────────────────

interface Props {
  world: WorldState
  interp?: InterpRefs
}

export function WorldView({ world, interp }: Props) {
  // Read UI state from the global store. No prop drilling.
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

  // World-space origin of the current viewport tile window
  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0

  const containerRef   = useRef<HTMLDivElement>(null)
  const cameraStateRef = useRef({ x: cx, y: cy, zoom: 1.5 })
  const [dims, setDims] = useState({ w: 0, h: 0 })
  // Hide the game canvas behind a solid overlay until the first world draw lands,
  // preventing the green Cubeforge placeholder from flashing on load.
  const [mapReady, setMapReady] = useState(false)

  // Follow target: canvas pixel coords (viewport-relative)
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
    // Convert screen → canvas tile → world tile
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
              <Transform x={cx} y={cy} />
              <Sprite
                width={W}
                height={H}
                src="world_canvas"
                color="#ffffff"
                zIndex={0}
              />
              <WorldTextureUpdater world={world} interp={interp} selectedOrgId={selectedOrgId} overlay={overlay} focus={focus} viewFlags={viewFlags} onFirstDraw={() => setMapReady(true)} />
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
