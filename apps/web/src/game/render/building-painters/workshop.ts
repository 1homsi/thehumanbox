import { OUTLINE, px } from './kit'
import type { P } from './kit'
import { paintCottage } from './dwellings'

/**
 * A workshop. In the stone age it is an open lean-to on two posts: a thatched
 * roof, a workbench, a stack of logs and a heap of stone. From the bronze age
 * on the tribe's cottage style takes over (see paintCottage).
 */
export function paintWorkshop(p: P) {
  if (p.tier > 0) {
    paintCottage(p)
    return
  }
  const { x0, y1, w, h } = p
  const roofTop = y1 - h * 0.72
  const roofLow = y1 - h * 0.5
  // Thatch: a slab sloping from the high post down to the low one, two rows thick.
  const cols = w + 2
  for (let i = 0; i < cols; i++) {
    const y = Math.round(roofTop + (i / (cols - 1)) * (roofLow - roofTop))
    px(p.ctx, x0 - 1 + i, y, 1, 1, '#d8bc6a')
    px(p.ctx, x0 - 1 + i, y + 1, 1, 2, '#b89a4a')
  }
  // Two posts hold the roof, the high one at the left.
  px(p.ctx, x0, roofTop, 1, y1 - roofTop, '#5a4028')
  px(p.ctx, x0 + w - 1, roofLow, 1, y1 - roofLow, '#5a4028')
  // Workbench on two legs, under the roof.
  const benchY = y1 - h * 0.28
  px(p.ctx, x0 + w * 0.35, benchY, w * 0.4, 1, '#8a6a44')
  px(p.ctx, x0 + w * 0.35, benchY + 1, 1, y1 - benchY - 1, '#5a4028')
  px(p.ctx, x0 + w * 0.75 - 1, benchY + 1, 1, y1 - benchY - 1, '#5a4028')
  // A stack of logs at the left, the cut ends pale.
  for (let r = 0; r < 2; r++) {
    const y = y1 - 2 - r * 2
    px(p.ctx, x0 + 1, y, 4, 2, '#7a5230')
    px(p.ctx, x0 + 1, y, 1, 2, '#d9b07a')
  }
  // A heap of stone at the right, the knapped faces lighter.
  px(p.ctx, x0 + w - 5, y1 - 3, 3, 3, '#8a8a84')
  px(p.ctx, x0 + w - 3, y1 - 2, 3, 2, '#9c9a92')
  px(p.ctx, x0 + w - 4, y1 - 5, 2, 2, '#b4b2aa')
  px(p.ctx, x0, y1 - 1, w, 1, OUTLINE)
}
