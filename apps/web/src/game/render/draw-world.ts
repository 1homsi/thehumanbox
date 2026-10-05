import type { WorldState } from '../../shared/types'
import { type ViewFlags } from '../../state/store'
import { createFrame } from './layers/frame'
import { draw_base } from './layers/base'
import { draw_atmosphere } from './layers/atmosphere'
import { draw_terrain } from './layers/terrain'
import { draw_overlays } from './layers/overlays'
import { draw_landuse } from './layers/landuse'
import { draw_buildings } from './layers/buildings'
import { draw_animals } from './layers/animals'
import { draw_people } from './layers/people'
import { draw_effects } from './layers/effects'
import { draw_hud } from './layers/hud'
import { cfActive } from './cf/active'

export function drawWorldOnCanvas(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  selectedOrgId: string | null,
  overlay: string | null,
  focus: string,
  viewFlags: ViewFlags,
  bounds?: { c0: number; c1: number; r0: number; r1: number },
  cameraZoom = 1,
  renderScale = 1,
  /**
   * 'below' / 'above' split the stack at the buildings so cubeforge layers can sit
   * between the two canvases (see cf/flags.ts); 'all' is the single canvas.
   */
  phase: 'all' | 'below' | 'above' = 'all',
  /** False when the TileLayer terrain draws the ground and this canvas is composited over it. */
  ground = true,
) {
  const f = createFrame(
    ctx,
    world,
    selectedOrgId,
    overlay,
    focus,
    viewFlags,
    bounds,
    cameraZoom,
    renderScale,
    ground,
  )
  if (!f) return
  if (phase !== 'above') {
    draw_base(f)
    if (!cfActive('atmosphere')) draw_atmosphere(f)
    draw_terrain(f)
    if (!cfActive('overlays')) draw_overlays(f)
    draw_landuse(f)
  }
  if (phase !== 'below') {
    draw_buildings(f)
    draw_animals(f)
    draw_people(f)
    if (!cfActive('effects')) draw_effects(f)
    if (!cfActive('hud')) draw_hud(f)
  }
}
