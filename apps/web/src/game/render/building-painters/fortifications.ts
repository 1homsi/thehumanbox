import { shade } from '../sprite-colors'
import { outline, px, wallTexture } from './kit'
import type { P } from './kit'

const STONE = '#8c8678'
const OPENING = '#2a1c10'
const OAK = '#7a5232'
const IRON = '#3a3a40'

/**
 * A town gate on a road through the palisade: two stone piers stand taller than the wall
 * between them, a lintel with merlons crosses the top, and oak doors with iron straps close a
 * round-headed opening. The opening is the mark that makes it a gate, not a wall tile.
 */
export function paintGate(p: P) {
  const { x0, y1, w, h } = p
  const top = y1 - h * 0.85
  const pier = Math.max(2, Math.floor(w * 0.25))
  const openW = w - pier * 2
  const openTop = y1 - h * 0.5
  // The piers, the lintel and the merlons above it.
  wallTexture(p, x0, top, pier, y1 - top, STONE)
  wallTexture(p, x0 + w - pier, top, pier, y1 - top, STONE)
  wallTexture(p, x0 + pier, top + 2, openW, 2, shade(STONE, 1.06))
  for (let x = x0; x < x0 + w; x += 4) px(p.ctx, x, top - 1, 2, 1, shade(STONE, 0.85))
  // The opening: a dark round head over the doors.
  px(p.ctx, x0 + pier, openTop, openW, y1 - openTop, OPENING)
  px(p.ctx, x0 + pier + 1, openTop - 1, openW - 2, 1, OPENING)
  // Two doors, closed, with a strap across each.
  const half = openW / 2
  px(p.ctx, x0 + pier, openTop + 2, half, y1 - openTop - 2, OAK)
  px(p.ctx, x0 + pier + half, openTop + 2, openW - half, y1 - openTop - 2, shade(OAK, 0.82))
  px(p.ctx, x0 + pier, openTop + 4, openW, 1, IRON)
  px(p.ctx, x0 + pier, y1 - 3, openW, 1, IRON)
  outline(p.ctx, x0 + pier, openTop - 1, openW, y1 - openTop + 1)
}

/**
 * A tower on a palisade corner or a hill: a stone shaft taller than the houses round it, a
 * battlement along its top, an arrow slit above a low door, and a darker course of stone at the foot.
 */
export function paintTower(p: P) {
  const { x0, y1, w, h } = p
  const shaftW = Math.max(6, Math.round(w * 0.6))
  const sx = x0 + (w - shaftW) / 2
  const top = y1 - h * 0.98
  const merlon = 2
  wallTexture(p, sx, top + merlon, shaftW, y1 - top - merlon, STONE)
  outline(p.ctx, sx, top + merlon, shaftW, y1 - top - merlon)
  for (let x = sx; x < sx + shaftW; x += 4) {
    px(p.ctx, x, top, Math.min(3, sx + shaftW - x), merlon, shade(STONE, 0.9))
  }
  px(p.ctx, sx, y1 - 4, shaftW, 1, shade(STONE, 0.72))
  const cx = x0 + w / 2
  px(p.ctx, cx - 0.5, top + merlon + 3, 1, 4, OPENING)
  px(p.ctx, cx - 1.5, y1 - 6, 3, 5, OPENING)
}
