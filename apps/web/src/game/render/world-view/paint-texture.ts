import { drawWorldOnCanvas } from '../draw-world'
import { worldRenderWindow } from '../render-timing'
import { terrainSeason } from '../base-layer'
import { terrainProbe } from '../terrain-tiles/probe'
import type { TerrainSyncFn } from '../terrain-tiles/TerrainTileLayer'
import type { WorldState } from '../../../shared/types'
import type { ViewFlags } from '../../../state/store'
import { TILE } from '../../model/palette'

/**
 * Paint the world into the dynamic texture. With `terrain` the ground belongs to the TileLayer
 * backend: it is synced first, and the texture starts transparent and holds only what is drawn
 * over the ground.
 */
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
  terrain?: { sync: TerrainSyncFn | null },
) {
  const probing = terrainProbe.enabled
  if (terrain) {
    const t0 = probing ? performance.now() : 0
    const g = world.grid
    const result = terrain.sync?.({
      width: g.width,
      height: g.height,
      tiles: g.tiles,
      biomes: g.biomes,
      depth_map: g.depth_map as number[][] | undefined,
      season: terrainSeason(world),
      zoom,
    })
    if (probing && result && result.kind !== 'none') {
      terrainProbe.sync.push({ kind: result.kind, ms: performance.now() - t0, tiles: result.tilesWritten })
    }
    // The canvas is composited over the tile layer, so every pixel starts empty.
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  }
  const t0 = probing ? performance.now() : 0
  const bounds = {
    c0: Math.max(0, Math.floor(renderWindow.x / TILE)),
    c1: Math.min(world.grid.width, Math.ceil((renderWindow.x + renderWindow.width) / TILE)),
    r0: Math.max(0, Math.floor(renderWindow.y / TILE)),
    r1: Math.min(world.grid.height, Math.ceil((renderWindow.y + renderWindow.height) / TILE)),
  }
  ctx.setTransform(scale, 0, 0, scale, -renderWindow.x * scale, -renderWindow.y * scale)
  drawWorldOnCanvas(ctx, world, selectedOrgId, overlay, focus, viewFlags, bounds, zoom, scale, !terrain)
  if (probing) terrainProbe.paint.push(performance.now() - t0)
}
