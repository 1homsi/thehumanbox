import { getScaledBase } from '.././base-layer'
import type { DrawFrame } from './frame'

/** The cached terrain canvas of the 2D fallback. */
export function draw_base(f: DrawFrame) {
  const { ctx, renderScale, W, H, base } = f
  const scaled = renderScale < 1 ? getScaledBase(renderScale) : null
  if (scaled) ctx.drawImage(scaled, 0, 0, W, H)
  else ctx.drawImage(base, 0, 0)
}
