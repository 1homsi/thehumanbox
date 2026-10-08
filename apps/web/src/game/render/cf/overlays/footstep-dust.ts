import { TILE } from '../../../model/palette'

type Ctx = CanvasRenderingContext2D

/**
 * Dust under the feet of people who walk. A puff starts where someone was seen moving and grows
 * and fades over less than half a second. The pool is fixed in size and the puffs are painted with
 * the throttled ground pass, so the cost stays flat however many people are on screen.
 */

export const DUST_LIFE_MS = 460
export const DUST_POOL = 64
/** A person spawns a puff at most this often, so a quick walker does not fill the pool. */
const SPAWN_EVERY_MS = 260
/** A step smaller than this (tiles) is jitter, not walking. */
const MIN_STEP = 0.05
/** Forget people not seen for a while (the map is cleared when it grows past this). */
const MAX_TRACKED = 4000

interface Track {
  x: number
  y: number
  spawnedAt: number
}

export interface DustOrganism {
  id: string
  x: number
  y: number
  alive?: boolean
}

/** How a puff looks: people kick up a larger, paler cloud than a hoof or a paw. */
export interface DustStyle {
  colour: string
  /** Radius a puff grows to, in px. */
  radius: number
  /** Opacity when it starts. */
  alpha: number
}

export const PEOPLE_DUST: DustStyle = { colour: 'rgb(206,186,150)', radius: 2.5, alpha: 0.42 }
export const ANIMAL_DUST: DustStyle = { colour: 'rgb(186,160,118)', radius: 1.8, alpha: 0.3 }

export class FootstepDust {
  private readonly tracks = new Map<string, Track>()
  private readonly px = new Float64Array(DUST_POOL)
  private readonly py = new Float64Array(DUST_POOL)
  private readonly born = new Float64Array(DUST_POOL).fill(-Infinity)
  private next = 0

  private readonly style: DustStyle

  constructor(style: DustStyle = PEOPLE_DUST) {
    this.style = style
  }

  /** Notes where each person is now and starts a puff for those who stepped. */
  observe(
    organisms: readonly DustOrganism[],
    t: number,
    win: { x0: number; y0: number; x1: number; y1: number },
  ): void {
    if (this.tracks.size > MAX_TRACKED) this.tracks.clear()
    for (const o of organisms) {
      if (o.alive === false) continue
      const prev = this.tracks.get(o.id)
      const inView = o.x >= win.x0 && o.x <= win.x1 && o.y >= win.y0 && o.y <= win.y1
      if (!prev) {
        this.tracks.set(o.id, { x: o.x, y: o.y, spawnedAt: -Infinity })
        continue
      }
      const moved = Math.hypot(o.x - prev.x, o.y - prev.y)
      if (moved >= MIN_STEP && inView && t - prev.spawnedAt >= SPAWN_EVERY_MS) {
        this.spawn(o.x, o.y, t)
        prev.spawnedAt = t
      }
      prev.x = o.x
      prev.y = o.y
    }
  }

  private spawn(x: number, y: number, t: number): void {
    const i = this.next
    this.px[i] = x
    this.py[i] = y
    this.born[i] = t
    this.next = (i + 1) % DUST_POOL
  }

  /** Paints the live puffs. `ox, oy` is the grid origin (tiles), as for every painter. */
  paint(ctx: Ctx, ox: number, oy: number, t: number): void {
    ctx.save()
    ctx.fillStyle = this.style.colour
    for (let i = 0; i < DUST_POOL; i++) {
      const age = t - this.born[i]
      if (!(age >= 0 && age < DUST_LIFE_MS)) continue
      const k = age / DUST_LIFE_MS
      ctx.globalAlpha = (1 - k) * this.style.alpha
      const cx = (this.px[i] - ox) * TILE + TILE / 2
      const cy = (this.py[i] - oy) * TILE + TILE * 0.8
      ctx.beginPath()
      ctx.arc(cx, cy, 1 + k * this.style.radius, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}
