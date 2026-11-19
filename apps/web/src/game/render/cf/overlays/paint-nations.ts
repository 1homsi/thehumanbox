import type { WorldState } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import { territoryTileKey } from '../../../model/territory'
import { nationColour, nationLands } from '../../../model/nations'

const EDGE = 2

export function paintNationBorders(ctx: CanvasRenderingContext2D, world: WorldState): void {
  const nations = world.nations
  if (!nations?.length) return
  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
  const lands = nationLands(world)
  for (const nation of nations) {
    const land = lands.get(nation.id)
    if (!land) continue
    ctx.fillStyle = nationColour(nation.colour, 0.12)
    for (const [tx, ty] of land.tiles) ctx.fillRect((tx - ox) * TILE, (ty - oy) * TILE, TILE, TILE)
    ctx.fillStyle = nationColour(nation.colour, 0.85)
    const owns = (x: number, y: number) => land.keys.has(territoryTileKey(x, y))
    for (const [tx, ty] of land.tiles) {
      const px = (tx - ox) * TILE
      const py = (ty - oy) * TILE
      if (!owns(tx, ty - 1)) ctx.fillRect(px, py, TILE, EDGE)
      if (!owns(tx + 1, ty)) ctx.fillRect(px + TILE - EDGE, py, EDGE, TILE)
      if (!owns(tx, ty + 1)) ctx.fillRect(px, py + TILE - EDGE, TILE, EDGE)
      if (!owns(tx - 1, ty)) ctx.fillRect(px, py, EDGE, TILE)
    }
  }
}
