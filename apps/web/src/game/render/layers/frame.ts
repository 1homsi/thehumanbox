import { getBaseLayerCanvas } from '.././base-layer'
import { ruinedBuildingTiles } from '../base-parts/terrain-scans'

import type { WorldState } from '../../../shared/types'
import { type ViewFlags } from '../../../state/store'

import { zoomDetailLevel } from '.././character-visuals'
import { TILE } from '../../model/palette'

/** Everything one frame of the 2D fallback shares, computed once. */
export function createFrame(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  selectedOrgId: string | null,
  focus: string,
  viewFlags: ViewFlags,
  bounds: { c0: number; c1: number; r0: number; r1: number } | undefined,
  cameraZoom: number,
  renderScale: number,
) {
  const { width, height, tiles } = world.grid
  if (!tiles || tiles.length < height) return null
  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
  // Clip per-tile loops to the visible window when bounds is provided: it is computed by the
  // caller from camera + dims and already includes a margin.
  const r0 = bounds?.r0 ?? 0
  const r1 = bounds?.r1 ?? height
  const c0 = bounds?.c0 ?? 0
  const c1 = bounds?.c1 ?? width
  // Prefer the viewport-filtered list (smaller) but fall back to the full cache when it is empty:
  // `??` alone returns [] for an empty viewport list and would hide everybody.
  const organisms =
    world.viewport_organisms && world.viewport_organisms.length > 0
      ? world.viewport_organisms
      : (world.organisms ?? [])
  const animals =
    world.viewport_animals && world.viewport_animals.length > 0
      ? world.viewport_animals
      : (world.animals ?? [])
  // Below full resolution the frame is a minification, so bilinear filtering matches what the GPU's
  // LINEAR texture sampling showed before; at 1:1 keep hard pixel-art edges.
  ctx.imageSmoothingEnabled = renderScale < 1

  const base = getBaseLayerCanvas(world)
  if (!base) return null
  return {
    ctx,
    world,
    selectedOrgId,
    focus,
    viewFlags,
    cameraZoom,
    renderScale,
    ox,
    oy,
    r0,
    r1,
    c0,
    c1,
    organisms,
    animals,
    W: width * TILE,
    H: height * TILE,
    t: Date.now(),
    overview: zoomDetailLevel(cameraZoom) === 'overview',
    ruinedTiles: ruinedBuildingTiles(world.buildings),
    base,
  }
}

export type DrawFrame = NonNullable<ReturnType<typeof createFrame>>
