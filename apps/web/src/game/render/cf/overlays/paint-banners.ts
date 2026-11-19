import type { WorldState } from '../../../../shared/types'
import { lineageColor } from '../../../../shared/constants'
import { TILE } from '../../../model/palette'
import { nationColour } from '../../../model/nations'

type Ctx = CanvasRenderingContext2D

const POLE = '#3b2a1a'
const CROWN = '#f2d36b'

export interface TownBanner {
  x: number
  y: number
  colour: string
  capital: boolean
}

export function townBanners(
  world: Pick<WorldState, 'towns' | 'nations'>,
  ox: number,
  oy: number,
  bounds: { c0: number; c1: number; r0: number; r1: number },
): TownBanner[] {
  const towns = world.towns ?? []
  if (towns.length === 0) return []
  const nationOf = new Map<string, { colour: number; capital: number }>()
  for (const n of world.nations ?? []) for (const m of n.members) nationOf.set(m, n)
  const out: TownBanner[] = []
  for (const town of towns) {
    if (!town.planned) continue
    const col = town.center[0] - ox + 2
    const row = town.center[1] - oy - 2
    if (col < bounds.c0 - 1 || col > bounds.c1 + 1 || row < bounds.r0 - 1 || row > bounds.r1 + 2) continue
    const nation = nationOf.get(town.lineage_id)
    out.push({
      x: col,
      y: row,
      colour: nation ? nationColour(nation.colour) : lineageColor(town.lineage_id),
      capital: nation?.capital === town.id,
    })
  }
  return out
}

export function paintTownBanners(
  ctx: Ctx,
  f: { world: WorldState; ox: number; oy: number; bounds: TownBounds },
): void {
  const u = Math.max(1, Math.round(TILE / 8))
  for (const b of townBanners(f.world, f.ox, f.oy, f.bounds)) {
    const px = Math.round(b.x * TILE + TILE / 2)
    const base = Math.round((b.y + 1) * TILE)
    const top = base - u * 14
    ctx.fillStyle = POLE
    ctx.fillRect(px, top, u, u * 14)
    ctx.fillStyle = b.colour
    ctx.fillRect(px + u, top + u, u * 6, u * 4)
    ctx.fillStyle = POLE
    ctx.fillRect(px + u, top + u * 5, u * 6, u)
    if (b.capital) {
      ctx.fillStyle = CROWN
      ctx.fillRect(px + u * 3, top + u * 2, u * 2, u * 2)
      ctx.fillRect(px - u, top - u, u * 3, u)
    }
  }
}

type TownBounds = { c0: number; c1: number; r0: number; r1: number }
