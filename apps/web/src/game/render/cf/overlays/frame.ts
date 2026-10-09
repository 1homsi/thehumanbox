import type { WorldState } from '../../../../shared/types'
import type { ViewFlags } from '../../../../state/store'
import { TILE } from '../../../model/palette'

export interface TileWindow {
  c0: number
  c1: number
  r0: number
  r1: number
}

/** Everything one update of the overlay renderer reads, computed once per frame. */
export interface CfFrame {
  world: WorldState
  /** Wall-clock ms, the clock the painters animate on. */
  t: number
  zoom: number
  cam: { x: number; y: number }
  viewport: { w: number; h: number }
  dpr: number
  overlay: string | null
  focus: string
  viewFlags: ViewFlags
  /** Tiles in view (with a margin), clipped to the grid. */
  bounds: TileWindow
  organisms: WorldState['organisms']
  ox: number
  oy: number
  /** World size in map pixels. */
  W: number
  H: number
}

export interface FrameInput {
  world: WorldState
  t: number
  zoom: number
  cam: { x: number; y: number }
  viewport: { w: number; h: number }
  dpr: number
  overlay: string | null
  focus: string
  viewFlags: ViewFlags
}

/** Tile window covering the camera's view plus `margin` tiles, clipped to the grid. */
export function visibleWindow(
  cam: { x: number; y: number },
  zoom: number,
  viewport: { w: number; h: number },
  gridW: number,
  gridH: number,
  margin = 2,
): TileWindow {
  const halfW = viewport.w / Math.max(0.01, zoom) / 2
  const halfH = viewport.h / Math.max(0.01, zoom) / 2
  return {
    c0: Math.max(0, Math.floor((cam.x - halfW) / TILE) - margin),
    c1: Math.min(gridW, Math.ceil((cam.x + halfW) / TILE) + margin),
    r0: Math.max(0, Math.floor((cam.y - halfH) / TILE) - margin),
    r1: Math.min(gridH, Math.ceil((cam.y + halfH) / TILE) + margin),
  }
}

/**
 * The camera's rectangle in the painters' space (grid px, the grid origin removed), grown by `margin`
 * px on every side: what a painter may skip when an object's extent does not reach it. The camera is
 * converted the same way `CfOverlayRenderer.viewOf` converts it.
 */
export function painterView(
  f: Pick<CfFrame, 'cam' | 'zoom' | 'viewport' | 'ox' | 'oy'>,
  margin: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const zoom = Math.max(0.01, f.zoom)
  const cx = f.cam.x - f.ox * TILE
  const cy = f.cam.y - f.oy * TILE
  const hw = f.viewport.w / zoom / 2 + margin
  const hh = f.viewport.h / zoom / 2 + margin
  return { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh }
}

export function makeFrame(input: FrameInput): CfFrame {
  const { world } = input
  const { width, height } = world.grid
  const orgs =
    world.viewport_organisms && world.viewport_organisms.length > 0
      ? world.viewport_organisms
      : (world.organisms ?? [])
  return {
    ...input,
    bounds: visibleWindow(input.cam, input.zoom, input.viewport, width, height),
    organisms: orgs,
    ox: world.grid.origin_x ?? 0,
    oy: world.grid.origin_y ?? 0,
    W: width * TILE,
    H: height * TILE,
  }
}
