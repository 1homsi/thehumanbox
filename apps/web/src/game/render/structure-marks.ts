import { TILE } from '../model/palette'

/** Settlement structure strength arrives as whole percents, so a map holds at most ~100 looks. */
export function structureStrength(s: number): number {
  return Math.round(s * 100) / 100
}

/** What `paintStructureTile` draws depends on the strength alone: one key per percent. */
export function structureCellKey(s: number): string {
  return `St|${Math.round(s * 100)}`
}

/**
 * The mark of built-up land on one tile, with its top-left at (px, py): a house with a roof for
 * dense structure, a smaller one for medium, a low mound for sparse.
 */
export function paintStructureTile(ctx: CanvasRenderingContext2D, px: number, py: number, strength: number) {
  const s = structureStrength(strength)
  const cx = px + TILE / 2
  if (s >= 0.7) {
    ctx.fillStyle = `rgba(120,90,60,${0.6 + s * 0.3})`
    ctx.fillRect(px + 1, py + TILE * 0.5, TILE - 2, TILE * 0.5 - 1)
    ctx.fillStyle = `rgba(90,70,50,${0.7 + s * 0.25})`
    ctx.beginPath()
    ctx.moveTo(cx, py + 2)
    ctx.lineTo(px + TILE - 2, py + TILE * 0.52)
    ctx.lineTo(px + 2, py + TILE * 0.52)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(160,140,110,0.5)'
    ctx.fillRect(px + 2, py + TILE * 0.55, 3, 3)
    ctx.fillRect(px + TILE - 5, py + TILE * 0.65, 3, 3)
  } else if (s >= 0.35) {
    ctx.fillStyle = `rgba(100,65,30,${0.45 + s * 0.4})`
    ctx.fillRect(px + 2, py + TILE * 0.45, TILE - 4, TILE * 0.55 - 1)
    ctx.fillStyle = `rgba(80,50,20,${0.5 + s * 0.35})`
    ctx.beginPath()
    ctx.moveTo(cx - 1, py + 3)
    ctx.lineTo(px + TILE - 2, py + TILE * 0.47)
    ctx.lineTo(px + 2, py + TILE * 0.47)
    ctx.closePath()
    ctx.fill()
  } else {
    ctx.fillStyle = `rgba(130,95,45,${s * 2.5})`
    ctx.fillRect(px + 1, py + TILE * 0.6, TILE - 2, TILE * 0.35)
  }
}
