import { DRAWN } from '../pixel-art/buildings/index.ts'

/** Every building kind with a drawing of its own (see pixel-art/buildings). */
export const BUILDING_SPRITE_KINDS = Object.freeze(Object.keys(DRAWN))

export function hasBuildingSprite(kind: string): boolean {
  return kind in DRAWN
}
