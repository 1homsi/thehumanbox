import { TILE } from '../../../model/palette'
import type { CfFrame } from './frame'

type Ctx = CanvasRenderingContext2D
/** One rectangle of a piece: x, y, width, height in map pixels, and its colour. */
export type ArtPixel = [number, number, number, number, string]

/**
 * What each kind of artwork looks like, as rectangles around the centre of its tile (`cx`, `cy`): a cave
 * painting in red ochre on a rock slab, a sculpture on a plinth, a fresco panel, a painting on an easel,
 * a photograph on a tripod, a film reel and a glowing screen. The kinds follow the eras that make them.
 */
export function artworkPixels(kind: string, cx: number, cy: number): ArtPixel[] {
  const at = (dx: number, dy: number, w: number, h: number, c: string): ArtPixel => [
    cx + dx,
    cy + dy,
    w,
    h,
    c,
  ]
  switch (kind) {
    case 'cave_painting':
      return [
        at(-4, -2, 8, 5, '#6d6a66'),
        at(-4, -2, 8, 1, '#8c8883'),
        at(-2, -1, 3, 3, '#b5472d'),
        at(-2, -3, 1, 2, '#b5472d'),
        at(0, -3, 1, 2, '#b5472d'),
        at(1, 0, 2, 2, '#d9703a'),
      ]
    case 'sculpture':
      return [
        at(-3, 1, 6, 2, '#8a8f96'),
        at(-1, -5, 3, 3, '#d6dadf'),
        at(-2, -2, 5, 3, '#c3c8ce'),
        at(-2, 1, 5, 1, '#9da3aa'),
      ]
    case 'fresco':
      return [
        at(-4, -4, 8, 7, '#d9c9a3'),
        at(-4, -4, 8, 1, '#8a6a48'),
        at(-3, -3, 3, 2, '#3c6fb0'),
        at(0, -1, 3, 2, '#c0392b'),
        at(-2, 1, 2, 1, '#e0a030'),
      ]
    case 'painting':
      return [
        at(-2, 1, 1, 3, '#6b4a2e'),
        at(2, 1, 1, 3, '#6b4a2e'),
        at(-4, -4, 8, 6, '#7a5636'),
        at(-3, -3, 6, 4, '#f3efe6'),
        at(-2, -2, 2, 2, '#e0a030'),
        at(1, -1, 2, 2, '#3c8f5a'),
      ]
    case 'photograph':
      return [
        at(-3, 3, 1, 2, '#555555'),
        at(2, 3, 1, 2, '#555555'),
        at(-4, -2, 8, 5, '#2d2d2d'),
        at(-2, -3, 3, 1, '#444444'),
        at(-1, -1, 3, 3, '#8fc4e8'),
      ]
    case 'film':
      return [
        at(-4, -4, 8, 8, '#1f2124'),
        at(-1, -1, 3, 3, '#9aa0a6'),
        at(-4, -3, 1, 1, '#e8e8e8'),
        at(3, -3, 1, 1, '#e8e8e8'),
        at(-4, 2, 1, 1, '#e8e8e8'),
        at(3, 2, 1, 1, '#e8e8e8'),
      ]
    case 'digital':
      return [
        at(-4, -4, 8, 6, '#1f2a36'),
        at(-3, -3, 6, 4, '#0e3a4a'),
        at(-2, -2, 2, 1, '#36d6ff'),
        at(0, -1, 3, 1, '#36d6ff'),
        at(-1, 2, 3, 1, '#333333'),
      ]
    default:
      return []
  }
}

/**
 * Each artwork the map shows, drawn where it was made (its creator's tile): the last few artworks the
 * frame carries, so a cave painting of the stone age and a film of the modern age both stay where they are.
 */
export function paintArtworks(ctx: Ctx, f: CfFrame): void {
  const { world, ox, oy, bounds } = f
  for (const art of world.artworks ?? []) {
    if (art.x === undefined || art.y === undefined) continue
    const col = art.x - ox
    const row = art.y - oy
    if (col < bounds.c0 - 1 || col > bounds.c1 + 1 || row < bounds.r0 - 1 || row > bounds.r1 + 1) continue
    const cx = Math.round(col * TILE + TILE / 2)
    const cy = Math.round(row * TILE + TILE / 2)
    for (const [x, y, w, h, colour] of artworkPixels(art.kind, cx, cy)) {
      ctx.fillStyle = colour
      ctx.fillRect(x, y, w, h)
    }
  }
}
