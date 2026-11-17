import { TILE } from '../model/palette'
import { C, hexOf } from './pixel-art/palette.ts'

/** Settlement structure strength arrives as whole percents, so a map holds at most ~100 looks. */
export function structureStrength(s: number): number {
  return Math.round(s * 100) / 100
}

/** What `paintStructureTile` draws depends on the strength alone. The key stays one per percent. */
export function structureCellKey(s: number): string {
  return `St|${Math.round(s * 100)}`
}

const EARTH = hexOf(C.tan4)
const EARTH_SHADE = hexOf(C.tan3)
const PEBBLE = hexOf(C.grey7)

/** Trodden earth as rows of pixels: `e` bare earth, `s` its shaded edge, `p` a pebble. */
const SPARSE = [
  '........',
  '........',
  '........',
  '........',
  '...ee...',
  '..eees..',
  '........',
  '........',
]
const WORN = ['........', '........', '..eee...', '.eeeee..', '.eeeees.', '..eess..', '........', '........']
const PACKED = [
  '........',
  '.eeeee..',
  'eeeeeee.',
  'eepeeees',
  'eeeeepes',
  '.eeeees.',
  '..ssss..',
  '........',
]

/**
 * The mark of built-up land on one tile, with its top-left at (px, py): the grass worn away to bare
 * earth, a scuff where a few people pass, a packed yard with pebbles where many do. Solid palette pixels:
 * the marks were translucent little houses drawn with canvas triangles, which read as smudges and
 * doubled the real buildings standing on them.
 */
export function paintStructureTile(ctx: CanvasRenderingContext2D, px: number, py: number, strength: number) {
  const s = structureStrength(strength)
  const rows = s >= 0.7 ? PACKED : s >= 0.35 ? WORN : SPARSE
  for (let y = 0; y < TILE; y++) {
    const row = rows[y]
    for (let x = 0; x < TILE; x++) {
      const k = row[x]
      if (k === '.') continue
      ctx.fillStyle = k === 'e' ? EARTH : k === 's' ? EARTH_SHADE : PEBBLE
      ctx.fillRect(px + x, py + y, 1, 1)
    }
  }
}
