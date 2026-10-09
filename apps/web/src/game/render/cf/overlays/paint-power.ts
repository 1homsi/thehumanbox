import { TILE } from '../../../model/palette'
import { lineageEraTiers } from '../../draw-helpers'
import { nightLevel } from './night-sky'
import type { CfFrame } from './frame'

type Ctx = CanvasRenderingContext2D

/** The era tier a tribe needs to string poles and wires: industrial (tier 5) and later. */
export const POWER_TIER = 5
/** Two poles this close (Manhattan tiles) are wired together; each pole wires to its two nearest in reach. */
export const WIRE_REACH = 7

const WOOD = '#4a3a2a'
const WIRE = 'rgba(40,36,32,0.75)'
const LAMP = '#ffe08a'

/**
 * The wires between poles: each pole joins its two nearest neighbours within `reach`, and a wire is
 * listed once. Returns index pairs into `poles`.
 */
export function powerNetwork(
  poles: readonly { x: number; y: number }[],
  reach = WIRE_REACH,
): [number, number][] {
  const edges = new Map<number, [number, number]>()
  for (let i = 0; i < poles.length; i++) {
    const near: { j: number; d: number }[] = []
    for (let j = 0; j < poles.length; j++) {
      if (j === i) continue
      const d = Math.abs(poles[j].x - poles[i].x) + Math.abs(poles[j].y - poles[i].y)
      if (d <= reach) near.push({ j, d })
    }
    near.sort((a, b) => a.d - b.d || a.j - b.j)
    for (const { j } of near.slice(0, 2)) {
      const key = Math.min(i, j) * poles.length + Math.max(i, j)
      edges.set(key, [Math.min(i, j), Math.max(i, j)])
    }
  }
  return [...edges.values()]
}

/**
 * The poles and wires of the industrial and later tribes: a pole stands at each finished building of
 * such a tribe, wires run between neighbouring poles of the same tribe, and at night every pole has a
 * lamp lit on its top. Drawn on the effects layer, so the wires hang above the buildings.
 */
export function paintPower(ctx: Ctx, f: CfFrame): void {
  const { world, ox, oy, bounds } = f
  const buildings = world.buildings
  if (!buildings?.length) return
  const tiers = lineageEraTiers(world.lineage_eras)
  const byLineage = new Map<string, { x: number; y: number }[]>()
  for (const b of buildings) {
    const lineage = b.lineage_id ?? b.owner_lineage
    if (!lineage || b.ruined || (b.construction_progress ?? 1) < 1) continue
    if ((tiers.get(lineage) ?? 0) < POWER_TIER) continue
    const list = byLineage.get(lineage) ?? []
    list.push({ x: b.x, y: b.y })
    byLineage.set(lineage, list)
  }
  if (byLineage.size === 0) return
  const night = nightLevel(world) > 0

  ctx.save()
  for (const poles of byLineage.values()) {
    const spot = (p: { x: number; y: number }) => ({
      x: (p.x - ox) * TILE + TILE / 2,
      y: (p.y - oy) * TILE + TILE / 2,
    })
    // `bounds` are local tile columns and rows, as `spot` measures from the origin.
    const inView = (c: { x: number; y: number }) =>
      c.x >= bounds.c0 * TILE - 16 &&
      c.x <= (bounds.c1 + 1) * TILE + 16 &&
      c.y >= bounds.r0 * TILE - 16 &&
      c.y <= (bounds.r1 + 1) * TILE + 16
    const tops = poles.map((p) => {
      const c = spot(p)
      return { x: Math.round(c.x), y: Math.round(c.y) - 9, inView: inView(c) }
    })
    // Wires: a slight sag between poles.
    ctx.strokeStyle = WIRE
    ctx.lineWidth = 0.6
    for (const [a, b] of powerNetwork(poles)) {
      const pa = tops[a]
      const pb = tops[b]
      if (!pa.inView && !pb.inView) continue
      const sag = 2
      ctx.beginPath()
      ctx.moveTo(pa.x, pa.y)
      for (let s = 1; s <= 4; s++) {
        const t = s / 4
        ctx.lineTo(pa.x + (pb.x - pa.x) * t, pa.y + (pb.y - pa.y) * t + sag * 4 * t * (1 - t))
      }
      ctx.stroke()
    }
    // Poles: a post with a crossbar, and a lamp on its top at night.
    for (const p of tops) {
      if (!p.inView) continue
      ctx.globalAlpha = 1
      ctx.fillStyle = WOOD
      ctx.fillRect(p.x, p.y, 1, 10)
      ctx.fillRect(p.x - 2, p.y + 1, 5, 1)
      if (night) {
        ctx.globalAlpha = 0.35
        ctx.fillStyle = LAMP
        ctx.beginPath()
        ctx.arc(p.x + 0.5, p.y, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.fillRect(p.x, p.y - 1, 1, 1)
      }
    }
  }
  ctx.restore()
}
