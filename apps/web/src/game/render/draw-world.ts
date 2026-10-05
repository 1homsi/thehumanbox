import type { WorldState } from '../../shared/types'
import { type ViewFlags } from '../../state/store'
import { createFrame } from './layers/frame'
import { draw_base } from './layers/base'
import { draw_buildings } from './layers/buildings'
import { draw_animals } from './layers/animals'
import { draw_people } from './layers/people'

/**
 * The 2D canvas painter, used only by the fallback for browsers without WebGL2 (the map runs on
 * cubeforge everywhere else). It draws the ground, buildings, animals and people; weather, heat
 * maps, effects and labels exist only on the cubeforge path.
 */
export function drawWorldOnCanvas(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  selectedOrgId: string | null,
  focus: string,
  viewFlags: ViewFlags,
  bounds?: { c0: number; c1: number; r0: number; r1: number },
  cameraZoom = 1,
  renderScale = 1,
) {
  const f = createFrame(ctx, world, selectedOrgId, focus, viewFlags, bounds, cameraZoom, renderScale)
  if (!f) return
  draw_base(f)
  draw_buildings(f)
  draw_animals(f)
  draw_people(f)
}
