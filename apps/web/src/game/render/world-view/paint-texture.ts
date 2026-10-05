import { drawWorldOnCanvas } from '../draw-world'
import { worldRenderWindow } from '../render-timing'
import type { WorldState } from '../../../shared/types'
import type { ViewFlags } from '../../../state/store'
import { TILE } from '../../model/palette'
import { cfPerf } from '../cf/people/bridge'

export function paintWorldTexture(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  selectedOrgId: string | null,
  overlay: string | null,
  focus: string,
  viewFlags: ViewFlags,
  renderWindow: ReturnType<typeof worldRenderWindow>,
  zoom: number,
  scale: number,
) {
  const bounds = {
    c0: Math.max(0, Math.floor(renderWindow.x / TILE)),
    c1: Math.min(world.grid.width, Math.ceil((renderWindow.x + renderWindow.width) / TILE)),
    r0: Math.max(0, Math.floor(renderWindow.y / TILE)),
    r1: Math.min(world.grid.height, Math.ceil((renderWindow.y + renderWindow.height) / TILE)),
  }
  const started = performance.now()
  ctx.setTransform(scale, 0, 0, scale, -renderWindow.x * scale, -renderWindow.y * scale)
  drawWorldOnCanvas(ctx, world, selectedOrgId, overlay, focus, viewFlags, bounds, zoom, scale)
  cfPerf.canvasPaints++
  cfPerf.canvasPaintMs += performance.now() - started
}
