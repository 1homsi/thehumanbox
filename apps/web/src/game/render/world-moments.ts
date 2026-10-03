// Moments the world shows on the map: fireworks over a town when its tribe
// reaches a new age, and a soft drift of golden motes over a blessed tribe.
import type { WorldState } from '../../shared/types'
import { eraTier } from './building-sprites'

type Ctx = CanvasRenderingContext2D

interface Fireworks {
  x: number
  y: number
  start: number
}

const FIREWORKS_MS = 4200
let knownEras = new Map<string, string>()
let fireworks: Fireworks[] = []

function erasOf(world: WorldState): Map<string, string> {
  const eras = world.lineage_eras
  if (!eras) return new Map()
  if (Array.isArray(eras)) return new Map(eras.map((e) => [e.lineage_id, e.era_name]))
  return new Map(Object.entries(eras))
}

function mainTown(world: WorldState, lineage: string): { x: number; y: number } | null {
  let best: { x: number; y: number; pop: number } | null = null
  for (const s of world.settlements ?? []) {
    if (s.lineage_id !== lineage) continue
    const pop = s.population ?? 0
    if (!best || pop > best.pop) best = { x: s.center[0], y: s.center[1], pop }
  }
  return best
}

/** Notice tribes that reached a later age since the last frame. */
export function updateWorldMoments(world: WorldState, now: number) {
  const eras = erasOf(world)
  if (knownEras.size > 0) {
    for (const [lineage, era] of eras) {
      const before = knownEras.get(lineage)
      if (before && eraTier(era) > eraTier(before)) {
        const town = mainTown(world, lineage)
        if (town) fireworks.push({ ...town, start: now })
      }
    }
  }
  if (eras.size > 0) knownEras = eras
  fireworks = fireworks.filter((f) => now - f.start < FIREWORKS_MS).slice(-8)
}

export function worldMomentsActive(): boolean {
  return fireworks.length > 0
}

/** For tests. */
export function resetWorldMoments() {
  knownEras = new Map()
  fireworks = []
}

export function activeFireworks(): readonly Fireworks[] {
  return fireworks
}

const COLORS = ['#ffd34d', '#ff6a58', '#7fd0ff', '#b7ff7a', '#ff9ad5']

/** Bursts of sparks rising over a town, several shells staggered in time. */
export function drawFireworks(ctx: Ctx, toPx: (x: number, y: number) => [number, number], now: number) {
  for (const f of fireworks) {
    const [cx, cy] = toPx(f.x, f.y)
    const age = now - f.start
    for (let shell = 0; shell < 5; shell++) {
      const t0 = shell * 650
      const t = (age - t0) / 1200
      if (t < 0 || t > 1) continue
      const sx = cx + ((shell * 37) % 50) - 25
      const sy = cy - 40 - ((shell * 23) % 25)
      const color = COLORS[shell % COLORS.length]!
      if (t < 0.25) {
        // The shell climbing.
        ctx.fillStyle = '#fff4c2'
        ctx.fillRect(Math.round(sx), Math.round(cy - (cy - sy) * (t / 0.25)), 1, 2)
        continue
      }
      const burst = (t - 0.25) / 0.75
      const fade = 1 - burst * burst
      // A bright flash at the heart of the burst.
      if (burst < 0.2) {
        ctx.fillStyle = `rgba(255,250,220,${1 - burst * 5})`
        ctx.fillRect(Math.round(sx - 2), Math.round(sy - 2), 4, 4)
      }
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2 + shell
        const reach = (14 + ((k * 7 + shell * 3) % 12)) * Math.sqrt(burst)
        const droop = burst * burst * 10
        // Each spark trails a short streak back toward the centre.
        for (let seg = 0; seg < 3; seg++) {
          const d = reach - seg * 2.5
          if (d <= 0) continue
          const px = sx + Math.cos(a) * d
          const py = sy + Math.sin(a) * d + droop
          ctx.globalAlpha =
            fade * (1 - seg * 0.3) * (k % 3 === 0 && burst > 0.6 ? 0.5 + 0.5 * Math.sin(now * 0.05 + k) : 1)
          ctx.fillStyle = seg === 0 && burst < 0.35 ? '#fff4c2' : color
          ctx.fillRect(Math.round(px), Math.round(py), seg === 2 ? 1 : 2, seg === 2 ? 1 : 2)
        }
      }
      ctx.globalAlpha = 1
    }
  }
}

/** A handful of golden motes drifting up over each blessed tribe's town. */
export function drawBlessings(
  ctx: Ctx,
  world: WorldState,
  toPx: (x: number, y: number) => [number, number],
  now: number,
) {
  for (const lineage of world.faith?.blessed ?? []) {
    const town = mainTown(world, lineage)
    if (!town) continue
    const [cx, cy] = toPx(town.x, town.y)
    for (let k = 0; k < 6; k++) {
      const phase = (now / 2600 + k / 6) % 1
      const x = cx + Math.sin(k * 2.1 + now / 1400) * 18
      const y = cy - phase * 34
      ctx.fillStyle = `rgba(255,224,138,${0.75 * (1 - phase)})`
      ctx.fillRect(Math.round(x), Math.round(y), 2, 2)
    }
  }
}
