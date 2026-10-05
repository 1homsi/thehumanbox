import type { SceneOccupant } from '../../../scenes/core/types'
import { deterministicAppearanceIndex, resolveAgeStage, HUMAN_ATLAS_COLS } from '../../character-visuals'
import { pickHumanSprite } from '../../../../shared/sprites'
import type { LightSource } from '../../../scenes/shared/room-draw'
import { TILE_PX } from '../../../scenes/shared/room-constants'

/**
 * What a room scene is made of, apart from how it is drawn. The room is a
 * painted backdrop (floor, furniture, walls: Canvas2D drawers that already
 * exist) with the occupants on top. This is the occupants' side.
 */

/** Everything a room view needs from a scene's own look. */
export interface RoomPainter {
  /** Where the occupants stand, in tiles, for a given head count. */
  slots: Array<[number, number]>
  /** Outside, floor, furniture and walls: everything behind the people. */
  paintBack: (c: CanvasRenderingContext2D, time: number) => void
  /** Warm light pools drawn after the night dim. */
  nightLights: LightSource[]
}

export interface PlacedOccupant {
  id: string
  name: string
  /** Feet position in room pixels. */
  px: number
  py: number
  /** Cell of the people atlas (row-major). */
  frame: number
}

/** Radius of the click and hover circle around a person, in room pixels. */
export const HIT_RADIUS = 14
/** Size of the people atlas cell drawn for one person, in room pixels. */
export const OCCUPANT_SIZE = 32

/** Occupants at their slots. A slot missing for someone puts them at the room's middle. */
export function placeOccupants(occupants: readonly SceneOccupant[], slots: ReadonlyArray<[number, number]>) {
  return occupants.map((occ, i): PlacedOccupant => {
    const [cx, cy] = slots[i] ?? [7, 5]
    const sex = (occ.org.sex ?? 'male') as 'male' | 'female'
    const [col, row] = pickHumanSprite(
      sex,
      resolveAgeStage(occ.org),
      0,
      deterministicAppearanceIndex(occ.org.id),
    )
    return {
      id: occ.org.id,
      name: occ.org.name,
      px: cx * TILE_PX,
      py: cy * TILE_PX,
      frame: row * HUMAN_ATLAS_COLS + col,
    }
  })
}

/** Two-frame idle breath, phase-shifted per person so a full room does not bob in unison. */
export function idleBob(time: number, index: number): 0 | -1 {
  return Math.sin(time * 0.0035 + index * 1.7) > 0 ? 0 : -1
}

/**
 * The first person whose circle holds the point: the rule the 2D scenes always
 * used. The cubeforge views find candidates with `SpriteLayer.pick()` and then
 * apply the same circle, so a click lands where it always did.
 */
export function occupantAt(placed: readonly PlacedOccupant[], x: number, y: number): string | null {
  for (const o of placed) if (inHitCircle(o, x, y)) return o.id
  return null
}

function inHitCircle(o: PlacedOccupant, x: number, y: number): boolean {
  return (x - o.px) ** 2 + (y - (o.py - 2)) ** 2 < HIT_RADIUS * HIT_RADIUS
}

/**
 * The same answer through a cubeforge `SpriteLayer`: its `pick()` finds the
 * box over the point (the layer holds one HIT_RADIUS * 2 square per person,
 * in `placed` order) and the circle inside it decides. People stand at least
 * two tiles apart, so no two boxes overlap and the result equals `occupantAt`.
 */
export function pickOccupant(
  layer: { pick(x: number, y: number): number },
  placed: readonly PlacedOccupant[],
  x: number,
  y: number,
): string | null {
  const i = layer.pick(x, y)
  const o = i >= 0 ? placed[i] : undefined
  return o && inHitCircle(o, x, y) ? o.id : null
}

/**
 * The night dim of a room is a `multiply` of rgba(40, 32, 50, 0.55) over
 * everything, people included. A sprite cannot be multiplied after the fact,
 * so people get the same factor as a tint: per channel 1 - 0.55 * (1 - c / 255).
 */
export function nightTint(): number {
  const channel = (c: number) => Math.round(255 * (1 - 0.55 * (1 - c / 255)))
  return ((channel(40) << 24) | (channel(32) << 16) | (channel(50) << 8) | 0xff) >>> 0
}
