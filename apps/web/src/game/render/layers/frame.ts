import { getBaseLayerCanvas, ruinedBuildingTiles } from '.././base-layer'

import type { WorldState } from '../../../shared/types'
import { type ViewFlags } from '../../../state/store'

import { type PlacedLabel } from '.././settlement-labels'

import { zoomDetailLevel } from '.././character-visuals'
import { TILE } from '../../model/palette'

/** Everything one frame's layers share, computed once. */
export function createFrame(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  selectedOrgId: string | null,
  overlay: string | null,
  focus: string,
  viewFlags: ViewFlags,
  bounds: { c0: number; c1: number; r0: number; r1: number } | undefined,
  cameraZoom: number,
  renderScale: number,
  ground = true,
) {
  const { width, height, tiles, fire_intensity, structure } = world.grid
  const { food_trail, water_trail, path_trail, fertility, hazard } = world.grid
  if (!tiles || tiles.length < height) return null
  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
  // Clip per-tile overlay loops to the visible window when bounds is
  // provided. Bounds is computed by the caller from camera + dims and
  // already includes a margin. When zoomed out (whole world visible)
  // the bounds collapse to the full grid, so this is a no-op.
  const r0 = bounds?.r0 ?? 0
  const r1 = bounds?.r1 ?? height
  const c0 = bounds?.c0 ?? 0
  const c1 = bounds?.c1 ?? width
  // Prefer the viewport-filtered list (smaller) but fall back to the
  // full cache when it's empty. `??` alone returns [] when viewport is
  // an empty array, which silently hid all animals if the wire ever
  // shipped a frame with `animals: []` even though the cache held many.
  const orgPick =
    world.viewport_organisms && world.viewport_organisms.length > 0
      ? world.viewport_organisms
      : (world.organisms ?? [])
  const animalPick =
    world.viewport_animals && world.viewport_animals.length > 0
      ? world.viewport_animals
      : (world.animals ?? [])
  const organisms = orgPick
  const animals = animalPick
  const W = width * TILE
  const H = height * TILE
  const t = Date.now()
  // Zoomed-out frames skip the per-tile eye candy (fire glow gradients,
  // hut smoke, wavelets): hundreds of gradient/particle draws over
  // sub-2px tiles are invisible there but dominated frame time.
  const overview = zoomDetailLevel(cameraZoom) === 'overview'
  const ruinedTiles = ruinedBuildingTiles(world.buildings)
  // Below full resolution the frame is a minification, so bilinear
  // filtering matches what the GPU's LINEAR texture sampling showed
  // before; at 1:1 keep hard pixel-art edges.
  ctx.imageSmoothingEnabled = renderScale < 1

  const base = getBaseLayerCanvas(world, ground)
  if (!base) return null
  return {
    ctx,
    world,
    selectedOrgId,
    overlay,
    focus,
    viewFlags,
    bounds,
    cameraZoom,
    renderScale,
    width,
    height,
    tiles,
    fire_intensity,
    structure,
    food_trail,
    water_trail,
    path_trail,
    fertility,
    hazard,
    ox,
    oy,
    r0,
    r1,
    c0,
    c1,
    organisms,
    animals,
    W,
    H,
    t,
    overview,
    ruinedTiles,
    base,
    placedSettlementLabels: [] as PlacedLabel[],
  }
}

export type DrawFrame = NonNullable<ReturnType<typeof createFrame>>
