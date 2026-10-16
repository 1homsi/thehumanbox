import type { PeopleLabelSource } from './people/people-labels'

/**
 * The hand-off between the people sprite layer and code that is not part of its React tree:
 * the map pointer asks it who is under a click, and the overlay renderer asks for the people it
 * puts names, work poses and prayer glyphs on.
 */
let picker: ((worldX: number, worldY: number) => string | null) | null = null
let labelSource: PeopleLabelSource | null = null
let buildingPicker: ((worldX: number, worldY: number) => number) | null = null
/** The slot `drawnPersonAt` found for its person last time. */
let followSlot = -1

export function registerPeopleLayer(
  pick: (worldX: number, worldY: number) => string | null,
  source: PeopleLabelSource,
): () => void {
  picker = pick
  labelSource = source
  return () => {
    if (picker === pick) {
      picker = null
      labelSource = null
    }
  }
}

/** The person drawn under a world-pixel point, `null` for empty ground, or `undefined` before the layer exists. */
export function pickPersonAt(worldX: number, worldY: number): string | null | undefined {
  return picker ? picker(worldX, worldY) : undefined
}

/** The buildings layer's footprint pick: the id of the building covering a map point, or -1. */
export function registerBuildingLayer(pick: (worldX: number, worldY: number) => number): () => void {
  buildingPicker = pick
  return () => {
    if (buildingPicker === pick) buildingPicker = null
  }
}

/** The building drawn over a map point, `-1` for none, or `undefined` before the layer exists. */
export function pickBuildingAt(worldX: number, worldY: number): number | undefined {
  return buildingPicker ? buildingPicker(worldX, worldY) : undefined
}

/** Who is drawn where, for the name tags and work poses above the people. */
export function peopleLabelSource(): PeopleLabelSource | null {
  return labelSource
}

/** Where the people layer draws a person this frame (world pixels, the tile's middle), or null when it is not drawn. */
export function drawnPersonAt(id: string): { x: number; y: number } | null {
  const src = labelSource
  const ids = src?.ids
  if (!src || !ids) return null
  // A follow asks for the same person every frame, so the slot they had last time is tried first.
  let slot = followSlot
  if (slot < 0 || slot >= ids.length || ids[slot] !== id) {
    slot = -1
    for (let j = 0; j < ids.length; j++) {
      if (ids[j] === id) {
        slot = j
        break
      }
    }
    followSlot = slot
  }
  if (slot < 0 || src.hidden[slot] === 1) return null
  return { x: src.px[slot], y: src.py[slot] }
}
