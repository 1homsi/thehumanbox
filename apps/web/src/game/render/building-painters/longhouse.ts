import { hueShift } from '../sprite-colors'
import { cracks, door, gableRoof, outline, px, tintRoof, timberFrame, wallTexture, windowGlow } from './kit'
import type { P } from './kit'

/**
 * A longhouse for a big clan: one long timber hall under a single low ridge,
 * with a door at each end and a row of shuttered windows between them. It is
 * wider than any other home, so a street of them reads as a clan's row.
 */
export function paintLonghouse(p: P) {
  const { x0, y1, w, h, rng } = p
  const wallH = h * 0.5
  const wallY = y1 - wallH
  const base = hueShift('#9c8058', (rng() - 0.5) * 10, 1, 0.95 + rng() * 0.1)
  wallTexture(p, x0, wallY, w, wallH, base)
  timberFrame(p, x0, wallY, w, wallH)
  outline(p.ctx, x0, wallY, w, wallH)
  // The thatched ridge runs the full length of the hall.
  gableRoof(p, x0, wallY, w, h * 0.36, tintRoof(p, hueShift('#7c6a3a', (rng() - 0.5) * 12)))
  // A smoke hole in the ridge above the hearth.
  px(p.ctx, x0 + w / 2 - 1, wallY - h * 0.36 - 1, 2, 2, '#3a3026')
  // A door at each end of the hall.
  const endW = Math.max(3, w * 0.12)
  door(p, x0 + endW, y1, endW, wallH * 0.62)
  door(p, x0 + w - endW, y1, endW, wallH * 0.62)
  // Shuttered windows in the long wall between the doors.
  const nWin = Math.max(2, Math.floor(w / 9))
  for (let i = 0; i < nWin; i++) {
    const wx = x0 + endW * 2 + ((w - endW * 4) * (i + 0.5)) / nWin
    windowGlow(p, wx, wallY + wallH * 0.3, 3, 3)
    px(p.ctx, wx - 1, wallY + wallH * 0.3, 1, 3, '#584e38')
    px(p.ctx, wx + 3, wallY + wallH * 0.3, 1, 3, '#584e38')
  }
  // Doorsteps sit inside the footprint, clear of the street.
  px(p.ctx, x0 + endW - 2, y1 - 1, 4, 1, '#ada48a')
  px(p.ctx, x0 + w - endW - 2, y1 - 1, 4, 1, '#ada48a')
  cracks(p, x0, wallY, w, wallH)
}
