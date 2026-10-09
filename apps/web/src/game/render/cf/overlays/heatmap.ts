import type { WorldState } from '../../../../shared/types'
import type { ViewFlags } from '../../../../state/store'
import { lineageColor } from '../../../../shared/constants'
import { PATH_TRAIL_HOT } from '../../../../shared/types'
import { territoryEmphasis, territoryStanding } from '../../../model/territory'
import { parseColor } from './color'
import { TILE_ID } from '../../../model/terrain-ids'

/** How well a person's mood word sits: -1 grieving, 0 neutral, 1 joyful. Unknown words score nothing. */
const MOOD_SCORE: Record<string, number> = {
  joyful: 1,
  content: 0.5,
  calm: 0.2,
  hungry: -0.5,
  thirsty: -0.5,
  afraid: -0.7,
  angry: -0.8,
  grieving: -1,
}

export function moodScore(mood: string | undefined): number | null {
  if (!mood) return null
  return MOOD_SCORE[mood] ?? null
}

/** What a person holds: the goods they carry and the tools they have made. */
export function wealthOf(org: { carrying?: number; tools?: Record<string, number> }): number {
  let tools = 0
  for (const count of Object.values(org.tools ?? {})) tools += count
  return (org.carrying ?? 0) + tools
}

export interface HeatSettings {
  overlay: string | null
  viewFlags: Pick<ViewFlags, 'territory' | 'fertility' | 'hazard' | 'trails'>
  focus: string
}

/**
 * Per-tile colour for every map overlay (hazard, fertility, structures, trails, age, threat,
 * density, territory fill, and the always-on worn paths), composited source-over in the same
 * order `layers/overlays.ts` painted them. The result is one straight-alpha RGBA per tile, the
 * shape a xipjs `TileLayer` tint layer takes, plus the tile ids (1 where anything shows).
 *
 * It is a pure function of the world and the settings, so it only has to run when the grids,
 * the claims or the settings change, not every frame.
 */
export class HeatGrid {
  readonly tiles: Uint16Array
  readonly rgba: Uint8Array
  private readonly pr: Float32Array
  private readonly pg: Float32Array
  private readonly pb: Float32Array
  private readonly pa: Float32Array
  /** Tiles touched by the sparse (organism-driven) overlays, so only they are scanned. */
  private readonly touched: Int32Array
  private touchedCount = 0
  private readonly heat: Float32Array
  private readonly count: Float32Array

  readonly width: number
  readonly height: number

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    const n = width * height
    this.tiles = new Uint16Array(n)
    this.rgba = new Uint8Array(n * 4)
    this.pr = new Float32Array(n)
    this.pg = new Float32Array(n)
    this.pb = new Float32Array(n)
    this.pa = new Float32Array(n)
    this.touched = new Int32Array(n)
    this.heat = new Float32Array(n)
    this.count = new Float32Array(n)
  }

  private blend(i: number, r: number, g: number, b: number, a: number): void {
    // CSS clamps colour channels (the trails overlay can sum past 255) and alpha before blending.
    if (r > 255) r = 255
    if (g > 255) g = 255
    if (b > 255) b = 255
    if (a > 1) a = 1
    const k = 1 - a
    this.pr[i] = r * a + this.pr[i] * k
    this.pg[i] = g * a + this.pg[i] * k
    this.pb[i] = b * a + this.pb[i] * k
    this.pa[i] = a + this.pa[i] * k
  }

  /** Recompute everything. Returns the number of tiles that show a tint. */
  compute(world: WorldState, s: HeatSettings, organisms: WorldState['organisms']): number {
    const { width, height } = this
    const n = width * height
    this.pr.fill(0)
    this.pg.fill(0)
    this.pb.fill(0)
    this.pa.fill(0)
    const ox = world.grid.origin_x ?? 0
    const oy = world.grid.origin_y ?? 0
    const g = world.grid

    switch (s.overlay) {
      case 'hazard':
        this.scan(g.hazard, 0.05, (i, v) => this.blend(i, 220, 40, 30, Math.min(0.75, v * 0.9)))
        break
      case 'fertility':
        this.scan(g.fertility, 0.1, (i, v) => this.blend(i, 80, 200, 80, Math.min(0.55, v * 0.6)))
        break
      case 'structures':
        this.scan(g.structure, 0.05, (i, v) => this.blend(i, 255, 170, 60, Math.min(0.7, v * 0.8)))
        break
      case 'trails':
        this.trailsOverlay(g)
        break
      case 'age':
        this.ageOverlay(organisms, ox, oy)
        break
      case 'threat':
        this.threatOverlay(organisms, ox, oy)
        break
      case 'density':
        this.densityOverlay(organisms, ox, oy)
        break
      case 'food':
        this.foodOverlay(g)
        break
      case 'wealth':
        this.wealthOverlay(organisms, ox, oy)
        break
      case 'mood':
        this.moodOverlay(organisms, ox, oy)
        break
      default:
        break
    }

    if (s.viewFlags.territory && world.territory) this.territoryFill(world, s.focus, ox, oy)

    if (s.viewFlags.fertility && g.fertility) {
      const fer = g.fertility
      for (let row = 0; row < height; row++) {
        const r = fer[row]
        if (!r) continue
        for (let col = 0; col < width; col++) {
          const f = r[col]
          if (f == null) continue
          if (f > 0.55) this.blend(row * width + col, 80, 180, 80, Math.min(0.45, (f - 0.55) * 1.2))
          else if (f < 0.25) this.blend(row * width + col, 150, 90, 50, Math.min(0.45, (0.25 - f) * 1.5))
        }
      }
    }

    if (s.viewFlags.hazard && g.hazard) {
      this.scan(g.hazard, 0.02, (i, v) => this.blend(i, 200, 40, 40, Math.min(0.55, v * 0.9)))
    }

    // Always show high-traffic paths subtly.
    if (g.path_trail) {
      const pt = g.path_trail
      const hot = g.path_trail_hot
      if (hot) {
        for (let i = 0; i + 1 < hot.length; i += 2) {
          const row = hot[i]
          const col = hot[i + 1]
          const p = pt[row]?.[col] ?? 0
          if (p < PATH_TRAIL_HOT) continue
          this.blend(row * width + col, 160, 130, 80, Math.min(0.28, p * 0.3))
        }
      } else {
        this.scan(pt, PATH_TRAIL_HOT, (i, p) => this.blend(i, 160, 130, 80, Math.min(0.28, p * 0.3)))
      }
    }

    if (s.viewFlags.trails && (g.food_trail || g.water_trail || g.path_trail)) {
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          const f = g.food_trail?.[row]?.[col] ?? 0
          const w = g.water_trail?.[row]?.[col] ?? 0
          const p = g.path_trail?.[row]?.[col] ?? 0
          if (f < 0.1 && w < 0.1 && p < 0.1) continue
          const i = row * width + col
          if (p >= 0.1) this.blend(i, 220, 220, 220, Math.min(0.35, p * 0.5))
          if (f >= 0.1) this.blend(i, 240, 220, 80, Math.min(0.4, f * 0.5))
          if (w >= 0.1) this.blend(i, 100, 170, 240, Math.min(0.4, w * 0.5))
        }
      }
    }

    // Resolve the accumulators into straight-alpha bytes.
    let shown = 0
    const { rgba, tiles, pr, pg, pb, pa } = this
    for (let i = 0; i < n; i++) {
      const a = pa[i]
      const o = i * 4
      if (a <= 0.002) {
        tiles[i] = 0
        rgba[o + 3] = 0
        continue
      }
      tiles[i] = 1
      rgba[o] = Math.round(pr[i] / a)
      rgba[o + 1] = Math.round(pg[i] / a)
      rgba[o + 2] = Math.round(pb[i] / a)
      rgba[o + 3] = Math.round(a * 255)
      shown++
    }
    return shown
  }

  private scan(grid: number[][] | undefined, min: number, apply: (i: number, v: number) => void): void {
    if (!grid) return
    const { width, height } = this
    for (let row = 0; row < height; row++) {
      const r = grid[row]
      if (!r) continue
      const base = row * width
      for (let col = 0; col < width; col++) {
        const v = r[col] ?? 0
        if (v < min) continue
        apply(base + col, v)
      }
    }
  }

  private trailsOverlay(g: WorldState['grid']): void {
    const { width, height } = this
    for (let row = 0; row < height; row++) {
      const fr = g.food_trail?.[row]
      const wr = g.water_trail?.[row]
      const pr = g.path_trail?.[row]
      for (let col = 0; col < width; col++) {
        const f = fr?.[col] ?? 0
        const w = wr?.[col] ?? 0
        const p = pr?.[col] ?? 0
        if (f < 0.05 && w < 0.05 && p < 0.05) continue
        const r = Math.round(255 * f + 70 * w + 40 * p)
        const gg = Math.round(200 * f + 130 * w + 200 * p)
        const b = Math.round(40 * f + 220 * w + 70 * p)
        const a = Math.min(0.65, (f + w + p) * 0.5)
        this.blend(row * width + col, r, gg, b, Number(a.toFixed(2)))
      }
    }
  }

  private begin(): void {
    this.touchedCount = 0
    this.heat.fill(0)
    this.count.fill(0)
  }

  private touch(idx: number, value: number, counted: boolean): void {
    if (this.heat[idx] === 0 && this.count[idx] === 0) this.touched[this.touchedCount++] = idx
    this.heat[idx] += value
    if (counted) this.count[idx] += 1
  }

  private ageOverlay(organisms: WorldState['organisms'], ox: number, oy: number): void {
    const { width, height } = this
    this.begin()
    for (const org of organisms) {
      if (!org.alive) continue
      const tx = Math.round(org.x - ox)
      const ty = Math.round(org.y - oy)
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = tx + dx
          const ny = ty + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          this.touch(ny * width + nx, org.age, true)
        }
      }
    }
    for (let k = 0; k < this.touchedCount; k++) {
      const idx = this.touched[k]
      const c = this.count[idx]
      if (c === 0) continue
      const t = Math.min(1, this.heat[idx] / c / 3000)
      this.blend(idx, Math.round(80 + t * 175), Math.round(220 - t * 140), Math.round(180 - t * 160), 0.55)
    }
  }

  private threatOverlay(organisms: WorldState['organisms'], ox: number, oy: number): void {
    const { width, height } = this
    this.begin()
    const R = 3
    for (const org of organisms) {
      if (!org.alive || (org.fear_level ?? 0) < 0.3) continue
      const tx = Math.round(org.x - ox)
      const ty = Math.round(org.y - oy)
      const f = org.fear_level ?? 0
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.abs(dx) + Math.abs(dy)
          if (d > R) continue
          const nx = tx + dx
          const ny = ty + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          this.touch(ny * width + nx, (f * (R - d + 1)) / (R + 1), false)
        }
      }
    }
    for (let k = 0; k < this.touchedCount; k++) {
      const idx = this.touched[k]
      const v = this.heat[idx]
      if (v < 0.15) continue
      const t = Math.min(1, v / 2)
      this.blend(
        idx,
        255,
        Math.round(140 - t * 100),
        Math.round(60 - t * 40),
        Number((0.3 + t * 0.4).toFixed(2)),
      )
    }
  }

  /** Food: the cells that grow food, and the food carried along the paths. */
  private foodOverlay(g: WorldState['grid']): void {
    const { width, height } = this
    for (let row = 0; row < height; row++) {
      const r = g.tiles[row]
      if (!r) continue
      for (let col = 0; col < width; col++) {
        if (r[col] === TILE_ID.FOOD) this.blend(row * width + col, 120, 210, 70, 0.5)
      }
    }
    this.scan(g.food_trail, 0.1, (i, v) => this.blend(i, 240, 220, 80, Math.min(0.6, v * 0.6)))
  }

  /** Wealth: what each person carries and the tools they hold, spread a little around them. */
  private wealthOverlay(organisms: WorldState['organisms'], ox: number, oy: number): void {
    const { width, height } = this
    this.begin()
    const R = 2
    for (const org of organisms) {
      if (!org.alive) continue
      const wealth = wealthOf(org)
      if (wealth <= 0) continue
      const tx = Math.round(org.x - ox)
      const ty = Math.round(org.y - oy)
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.abs(dx) + Math.abs(dy)
          if (d > R) continue
          const nx = tx + dx
          const ny = ty + dy
          if (nx >= 0 && ny >= 0 && ny < height && nx < width) this.touch(ny * width + nx, wealth, false)
        }
      }
    }
    let maxW = 1
    for (let k = 0; k < this.touchedCount; k++) maxW = Math.max(maxW, this.heat[this.touched[k]])
    for (let k = 0; k < this.touchedCount; k++) {
      const idx = this.touched[k]
      const t = Math.min(this.heat[idx] / maxW, 1)
      this.blend(
        idx,
        245,
        Math.round(215 - t * 40),
        Math.round(90 - t * 60),
        Number((0.2 + t * 0.5).toFixed(2)),
      )
    }
  }

  /** Mood: the average mood of the people around each cell, sad red and content gold. */
  private moodOverlay(organisms: WorldState['organisms'], ox: number, oy: number): void {
    const { width, height } = this
    this.begin()
    const R = 2
    for (const org of organisms) {
      const score = moodScore(org.mood)
      if (!org.alive || score === null) continue
      const tx = Math.round(org.x - ox)
      const ty = Math.round(org.y - oy)
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.abs(dx) + Math.abs(dy)
          if (d > R) continue
          const nx = tx + dx
          const ny = ty + dy
          if (nx >= 0 && ny >= 0 && ny < height && nx < width) this.touch(ny * width + nx, score, true)
        }
      }
    }
    for (let k = 0; k < this.touchedCount; k++) {
      const idx = this.touched[k]
      const count = this.count[idx]
      if (count === 0) continue
      const average = this.heat[idx] / count
      if (Math.abs(average) < 0.05) continue
      if (average > 0) this.blend(idx, 250, 210, 80, Math.min(0.5, 0.15 + average * 0.4))
      else this.blend(idx, 220, 70, 60, Math.min(0.55, 0.15 - average * 0.45))
    }
  }

  private densityOverlay(organisms: WorldState['organisms'], ox: number, oy: number): void {
    const { width, height } = this
    this.begin()
    const R = 4
    for (const org of organisms) {
      if (!org.alive) continue
      const tx = Math.round(org.x - ox)
      const ty = Math.round(org.y - oy)
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.abs(dx) + Math.abs(dy)
          if (d > R) continue
          const nx = tx + dx
          const ny = ty + dy
          if (nx >= 0 && ny >= 0 && ny < height && nx < width) this.touch(ny * width + nx, R - d + 1, false)
        }
      }
    }
    let maxD = 1
    for (let k = 0; k < this.touchedCount; k++) maxD = Math.max(maxD, this.heat[this.touched[k]])
    for (let k = 0; k < this.touchedCount; k++) {
      const idx = this.touched[k]
      const v = this.heat[idx]
      if (v < 1) continue
      const t2 = Math.min(v / maxD, 1)
      this.blend(
        idx,
        Math.round(80 + t2 * 175),
        Math.round(200 - t2 * 100),
        Math.round(255 - t2 * 200),
        Number((0.25 + t2 * 0.45).toFixed(2)),
      )
    }
  }

  private territoryFill(world: WorldState, focus: string, ox: number, oy: number): void {
    const { width, height } = this
    const territory = world.territory
    if (!territory) return
    const focused = focus.startsWith('lineage:') ? focus.slice('lineage:'.length) : null
    for (const claim of territory.claimed) {
      const standing = territoryStanding(claim.lid, focused, world.tribal_relations)
      const emphasis = territoryEmphasis(standing)
      const color = parseColor(lineageColor(claim.lid))
      const a = color.a * emphasis.fillAlpha
      // One claim's tiles are a single path in the painter: a tile listed twice paints once.
      const seen = new Set<number>()
      for (const [tx, ty] of claim.tiles) {
        const col = tx - ox
        const row = ty - oy
        if (col < 0 || col >= width || row < 0 || row >= height) continue
        const i = row * width + col
        if (seen.has(i)) continue
        seen.add(i)
        this.blend(i, color.r, color.g, color.b, a)
      }
    }
  }

  /** Tiles of the contested border, for the pulsing white layer. */
  contestedTiles(world: WorldState, ox: number, oy: number, out: Uint16Array): number {
    out.fill(0)
    let n = 0
    for (const [tx, ty] of world.territory?.contested ?? []) {
      const col = tx - ox
      const row = ty - oy
      if (col < 0 || col >= this.width || row < 0 || row >= this.height) continue
      out[row * this.width + col] = 1
      n++
    }
    return n
  }
}
