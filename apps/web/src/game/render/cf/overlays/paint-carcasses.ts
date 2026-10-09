import { TILE } from '../../../model/palette'
import type { CfFrame } from './frame'

type Ctx = CanvasRenderingContext2D
/** One rectangle of a drawing: x, y, width, height in map pixels, and its colour. */
type ArtPixel = [number, number, number, number, string]

/** Bird-ticks that pick a carcass clean (the simulation's `PICKED_CLEAN`). */
export const PICKED_CLEAN = 40

/** How wide a carcass lies, by its prey: a rabbit is a few pixels, a deer or a cow fills most of a tile. */
export function carcassWidth(kind: string): number {
  switch (kind) {
    case 'rabbit':
    case 'chicken':
    case 'frog':
    case 'duck':
    case 'bee':
      return 4
    case 'deer':
    case 'sheep':
    case 'cow':
    case 'horse':
    case 'boar':
    case 'camel':
      return 8
    default:
      return 6
  }
}

/**
 * The remains on the ground at a tile's centre (`cx`, `cy`): red meat with white bone, shrinking as birds
 * pick it over, and greying as it ages.
 */
export function carcassPixels(kind: string, picked: number, age: number, cx: number, cy: number): ArtPixel[] {
  const left = Math.max(0, 1 - picked / PICKED_CLEAN)
  const width = Math.max(2, Math.round(carcassWidth(kind) * (0.35 + 0.65 * left)))
  const x = cx - Math.floor(width / 2)
  const meat = age > 200 ? '#7a5a48' : '#8a2c22'
  return [
    [x, cy - 1, width, 3, meat],
    [x, cy + 1, width, 1, '#4a1812'],
    [x + 1, cy - 2, Math.max(1, width - 2), 1, '#e6dccb'],
  ]
}

/** Each carcass the map shows, lying on the ground where its prey fell (see `artworks` for the layer). */
export function paintCarcasses(ctx: Ctx, f: CfFrame): void {
  const { world, ox, oy, bounds } = f
  for (const c of world.carcasses ?? []) {
    const col = c.x - ox
    const row = c.y - oy
    if (col < bounds.c0 - 1 || col > bounds.c1 + 1 || row < bounds.r0 - 1 || row > bounds.r1 + 1) continue
    const cx = Math.round(col * TILE + TILE / 2)
    const cy = Math.round(row * TILE + TILE / 2)
    for (const [x, y, w, h, colour] of carcassPixels(c.kind, c.picked, c.age, cx, cy)) {
      ctx.fillStyle = colour
      ctx.fillRect(x, y, w, h)
    }
  }
}
