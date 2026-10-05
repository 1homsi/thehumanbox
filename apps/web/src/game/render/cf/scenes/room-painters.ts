import type { SceneContext } from '../../../scenes/core/types'
import type { FurnitureDrawer, RoomPalette } from '../../../scenes/shared/RoomCanvas'
import { CANVAS_H, CANVAS_W } from '../../../scenes/shared/room-constants'
import { collectNightLights, drawRoomFloor, drawWalls } from '../../../scenes/shared/room-draw'
import type { RoomPainter } from './room-model'

/** The tavern, temple, forge and settlement look: a palette and a furniture drawer per scene. */
export function roomPainter({
  ctx,
  palette,
  drawFurniture,
  occupantSlots,
}: {
  ctx: SceneContext
  palette: RoomPalette
  drawFurniture: FurnitureDrawer
  occupantSlots: (n: number) => Array<[number, number]>
}): RoomPainter {
  const fixtures = [...ctx.fixtures].sort((a, b) => a.y - b.y || a.x - b.x)
  return {
    slots: occupantSlots(ctx.occupants.length),
    nightLights: collectNightLights(fixtures),
    paintBack(c, time) {
      c.fillStyle = palette.outside
      c.fillRect(0, 0, CANVAS_W, CANVAS_H)
      drawRoomFloor(c, palette)
      for (const f of fixtures) drawFurniture(c, f, time)
      drawWalls(c, palette, time)
    },
  }
}
