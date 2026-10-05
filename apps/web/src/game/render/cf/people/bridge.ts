import type { PeopleLabelSource } from './people-labels'

/**
 * The hand-off between the people sprite layer and code that is not part of its React tree:
 * the map pointer asks it who is under a click, and the overlay renderer asks for the people it
 * puts names, work poses and prayer glyphs on.
 */
let picker: ((worldX: number, worldY: number) => string | null) | null = null
let labelSource: PeopleLabelSource | null = null

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

/** Who is drawn where, for the name tags and work poses above the people. */
export function peopleLabelSource(): PeopleLabelSource | null {
  return labelSource
}
