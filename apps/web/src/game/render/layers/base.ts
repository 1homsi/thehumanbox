import { getScaledBase } from '.././base-layer'

import { LOW_PERF } from '../../../shared/perf'

import { TILE } from '../../model/palette'

import { drawTreeSway } from '.././decorations'
import type { DrawFrame } from './frame'

/** The cached terrain canvas, then swaying trees. */
export function draw_base(f: DrawFrame) {
  const { ctx, world, renderScale, r0, r1, c0, c1, W, H, t, overview, base } = f
  if (renderScale < 1) {
    const scaled = getScaledBase(renderScale)
    if (scaled) {
      ctx.drawImage(scaled, 0, 0, W, H)
    } else {
      ctx.drawImage(base, 0, 0)
    }
  } else {
    ctx.drawImage(base, 0, 0)
  }
  if (!overview && !LOW_PERF && renderScale >= 1) {
    drawTreeSway(
      ctx,
      t,
      { x0: c0 * TILE, y0: r0 * TILE, x1: c1 * TILE, y1: r1 * TILE },
      { storm: world.weather?.kind === 'storm', windX: world.weather?.wind_x ?? 0 },
    )
  }
}
