import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Game, World, Entity, Transform, Sprite, Camera2D, useCamera, useGame, useEntity } from 'cubeforge'
import type { WorldState } from './types'
import { lineageColor } from './constants'

const TILE = 12

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
  9: '#3a6688',   // flooded — steel blue
  10: '#c8a020',  // mineral — gold/amber
  11: '#2a2018',  // scorched — very dark brown
}

const BIOME_OVERLAYS: Record<number, string> = {
  0: 'rgba(80,140,60,0.08)',    // grassland
  1: 'rgba(20,80,20,0.12)',     // forest
  2: 'rgba(160,120,40,0.14)',   // desert
  3: 'rgba(20,100,100,0.10)',   // wetland
  4: 'rgba(120,160,200,0.10)',  // tundra
  5: 'rgba(160,40,20,0.14)',    // volcanic
}

const THOUGHT_COLORS: Record<string, string> = {
  eating:                  '#6abf45',
  drinking:                '#4499ff',
  'heat dangerous':        '#e8450a',
  'hungry — searching':    '#cc8800',
  'thirsty — searching':   '#0099cc',
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

function drawClouds(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  weather: WorldState['weather'],
  t: number,
) {
  if (!weather || weather.kind === 'clear') return
  const isStorm = weather.kind === 'storm'
  const count   = isStorm ? 9 : 5
  const baseAlpha = weather.intensity * (isStorm ? 0.55 : 0.32)

  ctx.save()
  for (let i = 0; i < count; i++) {
    const seed  = (i + 1) * 127.1
    const baseX = ((seed * 73.3) % 1.0) * W
    const baseY = ((seed * 41.7) % 1.0) * H
    const speed = 0.018 + (i % 4) * 0.008
    const x     = ((baseX + t * speed) % (W + 320)) - 160
    const y     = baseY
    const rw    = W * (0.10 + (i % 3) * 0.06)
    const rh    = rw * 0.52

    const c   = isStorm ? '22,28,50' : '140,155,175'
    const grd = ctx.createRadialGradient(x, y, 0, x, y, rw)
    grd.addColorStop(0,   `rgba(${c},${baseAlpha})`)
    grd.addColorStop(0.55,`rgba(${c},${baseAlpha * 0.55})`)
    grd.addColorStop(1,   `rgba(${c},0)`)
    ctx.fillStyle = grd
    ctx.beginPath(); ctx.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2); ctx.fill()
    // second blob for puffiness
    ctx.beginPath(); ctx.ellipse(x + rw * 0.28, y - rh * 0.3, rw * 0.65, rh * 0.75, 0, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(x - rw * 0.22, y - rh * 0.2, rw * 0.55, rh * 0.65, 0, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  map: number[][] | undefined,
  width: number, height: number,
  colorFn: (v: number) => string,
) {
  if (!map) return
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const v = map[row]?.[col] ?? 0
      if (v < 4) continue
      ctx.fillStyle = colorFn(v)
      ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
    }
  }
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
  const { width, height, tiles, fire_intensity, biomes, structure } = world.grid
  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
  const animals = world.animals ?? []
  const W = width * TILE
  const H = height * TILE
  const t = Date.now()

  ctx.clearRect(0, 0, W, H)

  // Season sky tint (drawn behind everything)
  const seasonTints: Record<string, string> = {
    decline:  'rgba(180,110,30,0.07)',
    scarcity: 'rgba(90,60,30,0.11)',
    recovery: 'rgba(30,120,150,0.07)',
  }
  const skyTint = seasonTints[world.season]
  if (skyTint) { ctx.fillStyle = skyTint; ctx.fillRect(0, 0, W, H) }

  // Draw tiles + biome overlay
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const t = tiles[row][col]
      const px = col * TILE
      const py = row * TILE

      ctx.fillStyle = TILE_COLORS[t] ?? '#111'
      ctx.fillRect(px, py, TILE, TILE)

      // Biome tint
      if (biomes) {
        const b = biomes[row][col]
        if (b !== undefined) {
          ctx.fillStyle = BIOME_OVERLAYS[b] ?? ''
          if (ctx.fillStyle) ctx.fillRect(px, py, TILE, TILE)
        }
      }

      // Fire glow
      if (t === 4 && fire_intensity) {
        const fi = fire_intensity[row][col]
        ctx.fillStyle = `rgba(255,120,0,${fi * 0.55})`
        ctx.fillRect(px, py, TILE, TILE)
      }

      // Campfire — warm amber glow + halo on neighboring tiles
      if (t === 7 && fire_intensity) {
        const fi = fire_intensity[row][col]
        ctx.fillStyle = `rgba(255,200,80,${fi * 0.7})`
        ctx.fillRect(px, py, TILE, TILE)
        // soft halo on surrounding 2 tiles
        ctx.fillStyle = `rgba(255,160,40,${fi * 0.12})`
        ctx.fillRect(px - TILE * 2, py - TILE * 2, TILE * 5, TILE * 5)
      }

      // Hut — roof triangle + walls
      if (t === 8) {
        const cx2 = px + TILE / 2
        // warm inner glow
        ctx.fillStyle = 'rgba(255,220,120,0.18)'
        ctx.fillRect(px - TILE, py - TILE, TILE * 3, TILE * 3)
        // roof
        ctx.fillStyle = '#6b3a0a'
        ctx.beginPath()
        ctx.moveTo(cx2, py + 1)
        ctx.lineTo(px + TILE - 1, py + TILE * 0.55)
        ctx.lineTo(px + 1,        py + TILE * 0.55)
        ctx.closePath()
        ctx.fill()
        // walls
        ctx.fillStyle = '#c8a060'
        ctx.fillRect(px + 2, py + TILE * 0.55, TILE - 4, TILE * 0.45 - 1)
        // door
        ctx.fillStyle = '#3a1a00'
        ctx.fillRect(cx2 - 1, py + TILE * 0.7, 3, TILE * 0.3 - 1)
      }
    }
  }

  // Structure tier overlay — renders progressive building stages below the Hut tile level
  if (structure) {
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const s = structure[row][col]
        if (s < 0.05) continue
        const t = tiles[row][col]
        if (t === 8) continue  // Hut tile already drawn above
        const px = col * TILE
        const py = row * TILE
        const cx2 = px + TILE / 2

        if (s >= 0.70) {
          // Rocky shed — stone walls, partial roof
          ctx.fillStyle = `rgba(120,90,60,${0.6 + s * 0.3})`
          ctx.fillRect(px + 1, py + TILE * 0.5, TILE - 2, TILE * 0.5 - 1)
          ctx.fillStyle = `rgba(90,70,50,${0.7 + s * 0.25})`
          ctx.beginPath()
          ctx.moveTo(cx2, py + 2)
          ctx.lineTo(px + TILE - 2, py + TILE * 0.52)
          ctx.lineTo(px + 2, py + TILE * 0.52)
          ctx.closePath()
          ctx.fill()
          // stone texture dots
          ctx.fillStyle = 'rgba(160,140,110,0.5)'
          ctx.fillRect(px + 2, py + TILE * 0.55, 3, 3)
          ctx.fillRect(px + TILE - 5, py + TILE * 0.65, 3, 3)
        } else if (s >= 0.35) {
          // Crude shed — rough wood walls, no proper roof
          ctx.fillStyle = `rgba(100,65,30,${0.45 + s * 0.4})`
          ctx.fillRect(px + 2, py + TILE * 0.45, TILE - 4, TILE * 0.55 - 1)
          // leaning roof
          ctx.fillStyle = `rgba(80,50,20,${0.5 + s * 0.35})`
          ctx.beginPath()
          ctx.moveTo(cx2 - 1, py + 3)
          ctx.lineTo(px + TILE - 2, py + TILE * 0.47)
          ctx.lineTo(px + 2, py + TILE * 0.47)
          ctx.closePath()
          ctx.fill()
        } else {
          // Stick pile / early foundation — scattered material
          ctx.fillStyle = `rgba(130,95,45,${s * 2.5})`
          ctx.fillRect(px + 3, py + TILE - 4, TILE - 6, 3)
          ctx.fillRect(px + 1, py + TILE - 7, 3, TILE * 0.4)
          ctx.fillRect(px + TILE - 4, py + TILE - 7, 3, TILE * 0.4)
        }
      }
    }
  }

  // World memory overlays (fertility / hazard / pressure)
  if (overlay === 'fertility') {
    drawOverlay(ctx, world.grid.fertility_map, width, height, v => {
      // Low fertility (0) = burnt orange warning; high (255) = transparent
      const t = v / 255
      return `rgba(${Math.round(220 - t * 200)},${Math.round(60 + t * 140)},${Math.round(20)},${0.55 - t * 0.50})`
    })
  } else if (overlay === 'hazard') {
    drawOverlay(ctx, world.grid.hazard_map, width, height, v => {
      const t = v / 255
      return `rgba(255,${Math.round(20 + t * 30)},0,${t * 0.60})`
    })
  } else if (overlay === 'pressure') {
    drawOverlay(ctx, world.grid.pressure_map, width, height, v => {
      const t = v / 255
      return `rgba(60,${Math.round(100 + t * 120)},255,${t * 0.55})`
    })
  } else if (overlay === 'density') {
    // Population density — compute from organism positions (offset to viewport coords)
    const grid2d: number[][] = Array.from({ length: height }, () => new Array(width).fill(0))
    for (const org of world.organisms) {
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
    const maxD = Math.max(...grid2d.flat(), 1)
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

  // Territory Voronoi overlay — limited to orgs in viewport for performance
  const liveOrgs = world.organisms.filter(o => o.alive && o.lineage_id)
  if (viewFlags.territory && liveOrgs.length > 0) {
    const RADIUS = 8
    // Only consider orgs visible in viewport (+ radius buffer), cap at 200 for perf
    const vportOrgs = liveOrgs.filter(o => {
      const cx2 = o.x - ox, cy2 = o.y - oy
      return cx2 >= -RADIUS && cx2 < width + RADIUS && cy2 >= -RADIUS && cy2 < height + RADIUS
    }).slice(0, 200)
    if (vportOrgs.length > 0) {
      for (let ty = 0; ty < height; ty++) {
        for (let tx = 0; tx < width; tx++) {
          let nearest = null as typeof vportOrgs[0] | null
          let nearestDist = RADIUS + 1
          for (const org of vportOrgs) {
            const d = Math.abs((org.x - ox) - tx) + Math.abs((org.y - oy) - ty)
            if (d < nearestDist) { nearestDist = d; nearest = org }
          }
          if (nearest && nearestDist <= RADIUS) {
            const alpha = 0.09 * (1 - nearestDist / RADIUS)
            const col = lineageColor(nearest.lineage_id)
            ctx.fillStyle = col.replace('hsl', 'hsla').replace(')', `, ${alpha})`)
            ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE)
          }
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

  // Weather — clouds + rain streaks
  const weather = world.weather
  drawClouds(ctx, W, H, weather, t)
  if (weather && weather.kind !== 'clear') {
    const isStorm = weather.kind === 'storm'
    // Tint
    const tintAlpha = weather.intensity * (isStorm ? 0.38 : 0.22)
    ctx.fillStyle = isStorm ? `rgba(18,28,60,${tintAlpha})` : `rgba(45,90,170,${tintAlpha})`
    ctx.fillRect(0, 0, W, H)
    // Animated rain streaks — offset by time so they fall each frame
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
    const px = (animal.x - ox) * TILE + TILE / 2
    const py = (animal.y - oy) * TILE + TILE / 2
    if (animal.kind === 'rabbit') {
      ctx.fillStyle = '#c8a050'
      ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill()
    } else {
      // Deer: slightly larger, darker
      ctx.fillStyle = '#7a4e28'
      ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#c8a050'
      ctx.lineWidth = 0.8
      ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.stroke()
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
  for (const org of world.organisms) {
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

    // Elder ring — oldest member of their lineage
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

    // Carrying indicator — brown (wood) or gray (stone) square above body
    if (org.carrying > 0) {
      ctx.fillStyle = org.carrying_type === 2 ? '#9a9a9a' : '#8b5e3c'
      ctx.fillRect(px - 3, py - 13, 6, 4)
    }

    // Body
    ctx.fillStyle = THOUGHT_COLORS[org.thought] ?? '#cccccc'
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill()

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

function WorldTextureUpdater({ world, selectedOrgId, overlay, focus, viewFlags }: { world: WorldState; selectedOrgId: string | null; overlay: string | null; focus: string; viewFlags: ViewFlags }) {
  const engine = useGame()
  useEntity()
  const glTexRef  = useRef<WebGLTexture | null>(null)
  const offscreen = useRef<HTMLCanvasElement | null>(null)
  const texKeyRef = useRef<string>('')
  const initialised = useRef(false)

  // Initialise texture once on mount
  useEffect(() => {
    const rs = (engine as any).activeRenderSystem
    const gl: WebGL2RenderingContext = rs.gl

    // Determine the resolved URL key cubeforge will use for "world_canvas"
    const tmp = new Image()
    tmp.src = 'world_canvas'
    texKeyRef.current = tmp.src   // browser resolves to absolute URL

    // Create persistent GL texture
    const tex = gl.createTexture()!
    glTexRef.current = tex

    // Create offscreen canvas
    const W = world.grid.width * TILE
    const H = world.grid.height * TILE
    const cv = document.createElement('canvas')
    cv.width = W; cv.height = H
    offscreen.current = cv

    // Initial upload (blank/black so texture is valid)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    // Inject into cubeforge's texture cache
    rs.textures.set(texKeyRef.current, tex)
    if (rs.touchTexture) rs.touchTexture(texKeyRef.current)

    initialised.current = true
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-draw and re-upload whenever world changes
  useEffect(() => {
    if (!initialised.current || !glTexRef.current || !offscreen.current) return
    const rs = (engine as any).activeRenderSystem
    const gl: WebGL2RenderingContext = rs.gl

    const ctx = offscreen.current.getContext('2d')!
    drawWorldOnCanvas(ctx, world, selectedOrgId, overlay, focus, viewFlags)

    gl.bindTexture(gl.TEXTURE_2D, glTexRef.current)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, offscreen.current)

    // Keep key alive in LRU
    rs.textures.set(texKeyRef.current, glTexRef.current)
    if (rs.touchTexture) rs.touchTexture(texKeyRef.current)
  }, [world, engine, selectedOrgId, overlay, focus, viewFlags])

  return null
}

// ── OriginTracker ─────────────────────────────────────────────────────────────
// Compensates camera position when the server shifts the viewport origin,
// so the world appears stationary as new tiles load.

function OriginTracker({ ox, oy, cameraStateRef }: {
  ox: number; oy: number
  cameraStateRef: React.MutableRefObject<{ x: number; y: number; zoom: number }>
}) {
  const camera = useCamera()
  const prev = useRef<{ ox: number; oy: number } | null>(null)

  useEffect(() => {
    if (prev.current === null) { prev.current = { ox, oy }; return }
    const dox = ox - prev.current.ox
    const doy = oy - prev.current.oy
    if (dox !== 0 || doy !== 0) {
      const pos = camera.getPosition()
      const nx = pos.x - dox * TILE
      const ny = pos.y - doy * TILE
      camera.setPosition(nx, ny)
      cameraStateRef.current.x = nx
      cameraStateRef.current.y = ny
    }
    prev.current = { ox, oy }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ox, oy])

  return null
}

// ── CameraController ──────────────────────────────────────────────────────────
// Must be inside <Game>. Handles mouse drag (pan) and scroll wheel (zoom).
// containerEl: the outer div — wheel/pointerdown scoped to it so sidebar scrolls freely.

function CameraController({
  worldW, worldH, containerW, containerH, ox, oy,
  containerEl, cameraStateRef, followTarget, onViewportPan,
}: {
  worldW: number
  worldH: number
  containerW: number
  containerH: number
  ox: number
  oy: number
  containerEl: HTMLDivElement | null
  cameraStateRef: React.MutableRefObject<{ x: number; y: number; zoom: number }>
  followTarget: { x: number; y: number } | null
  onViewportPan?: (msg: unknown) => void
}) {
  const camera = useCamera()
  const drag = useRef({ active: false, startPX: 0, startPY: 0, startCamX: 0, startCamY: 0 })
  const initialised = useRef(false)
  const vpThrottle = useRef(0)

  // cubeforge's Camera2D isn't wired to the engine until after its first tick,
  // so setPosition called synchronously in useLayoutEffect lands on a stub.
  // We retry every animation frame until the camera actually moves to the target.
  useEffect(() => {
    if (initialised.current) return
    const tx = worldW / 2
    const ty = worldH / 2
    // Fit world to container so there's no blue background
    const fitZoom = Math.max(containerW / worldW, containerH / worldH)
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

  // Follow a target organism
  useEffect(() => {
    if (!followTarget) return
    camera.setPosition(followTarget.x, followTarget.y)
    cameraStateRef.current.x = followTarget.x
    cameraStateRef.current.y = followTarget.y
  }, [followTarget, camera, cameraStateRef])

  useEffect(() => {
    if (!containerEl) return

    const sendViewport = (camX: number, camY: number) => {
      const now = Date.now()
      if (now - vpThrottle.current < 150) return
      vpThrottle.current = now
      const worldCx = Math.round(camX / TILE) + ox
      const worldCy = Math.round(camY / TILE) + oy
      onViewportPan?.({ cx: worldCx, cy: worldCy })
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
      const nx = drag.current.startCamX - (e.clientX - drag.current.startPX) / zoom
      const ny = drag.current.startCamY - (e.clientY - drag.current.startPY) / zoom
      camera.setPosition(nx, ny)
      cameraStateRef.current.x = nx
      cameraStateRef.current.y = ny
      sendViewport(nx, ny)
    }
    const onUp = () => {
      drag.current.active = false
      const pos = camera.getPosition()
      sendViewport(pos.x, pos.y)
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 0.9
      const nz = Math.max(0.3, Math.min(8, camera.getZoom() * factor))
      camera.setZoom(nz)
      cameraStateRef.current.zoom = nz
    }

    // pointerdown + wheel scoped to the canvas container only
    containerEl.addEventListener('pointerdown', onDown)
    containerEl.addEventListener('wheel', onWheel, { passive: false })
    // move/up on window so dragging outside the container still works
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      containerEl.removeEventListener('pointerdown', onDown)
      containerEl.removeEventListener('wheel', onWheel)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [camera, containerEl])

  return null
}

// ── WorldView ─────────────────────────────────────────────────────────────────

interface Props {
  world: WorldState
  selectedOrgId: string | null
  followOrgId:   string | null
  onOrgSelect:   (id: string | null) => void
  overlay:       string | null
  focus:         string
  viewFlags:     ViewFlags
  onViewportPan?: (msg: unknown) => void
}

export function WorldView({ world, selectedOrgId, followOrgId, onOrgSelect, overlay, focus, viewFlags, onViewportPan }: Props) {
  const W = world.grid.width * TILE
  const H = world.grid.height * TILE
  const cx = W / 2
  const cy = H / 2

  // World-space origin of the current viewport tile window
  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0

  const containerRef  = useRef<HTMLDivElement>(null)
  const cameraStateRef = useRef({ x: cx, y: cy, zoom: 1.5 })
  const [dims, setDims] = useState({ w: 0, h: 0 })

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
    for (const org of world.organisms) {
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
      {dims.w > 0 && (
        <Game
          gravity={0}
          width={dims.w}
          height={dims.h}
          style={{ display: 'block' }}
        >
          <World background="#0a0a0a">
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
              <WorldTextureUpdater world={world} selectedOrgId={selectedOrgId} overlay={overlay} focus={focus} viewFlags={viewFlags} />
              <OriginTracker ox={ox} oy={oy} cameraStateRef={cameraStateRef} />
            </Entity>

            <CameraController
              worldW={W}
              worldH={H}
              containerW={dims.w}
              containerH={dims.h}
              ox={ox}
              oy={oy}
              containerEl={containerRef.current}
              cameraStateRef={cameraStateRef}
              followTarget={followTarget}
              onViewportPan={onViewportPan}
            />
          </World>
        </Game>
      )}
    </div>
  )
}
