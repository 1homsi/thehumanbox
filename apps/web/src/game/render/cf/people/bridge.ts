/**
 * The hand-off between the sprite layers and the code that is not React: the
 * canvas painter needs to know the people sprites exist (so it stops drawing
 * them), and the map pointer asks the layer who is under a click.
 */
const active = { people: false, animals: false }
let picker: ((worldX: number, worldY: number) => string | null) | null = null

/** True while the sprite layer for `what` is mounted, so the canvas painter leaves that part out. */
export function spriteLayerActive(what: 'people' | 'animals'): boolean {
  return active[what]
}

/** Marks the animals layer as mounted; returns the cleanup. */
export function registerAnimalLayer(): () => void {
  active.animals = true
  return () => {
    active.animals = false
  }
}

export function registerPeopleLayer(pick: (worldX: number, worldY: number) => string | null): () => void {
  active.people = true
  picker = pick
  return () => {
    if (picker === pick) {
      active.people = false
      picker = null
    }
  }
}

/**
 * The person drawn under a world-pixel point, `null` for empty ground, or
 * `undefined` when the sprite layer is not running (use the old hit test).
 */
export function pickPersonAt(worldX: number, worldY: number): string | null | undefined {
  return picker ? picker(worldX, worldY) : undefined
}

/** Dev-only timing, read by the benchmark page and the stats overlay. */
export interface CfPerf {
  canvasPaints: number
  canvasPaintMs: number
  peopleRebuilds: number
  peopleRebuildMs: number
  peopleFrames: number
  peopleAnimateMs: number
  animalRebuilds: number
  animalRebuildMs: number
  animalFrames: number
  animalAnimateMs: number
}

export const cfPerf: CfPerf = {
  canvasPaints: 0,
  canvasPaintMs: 0,
  peopleRebuilds: 0,
  peopleRebuildMs: 0,
  peopleFrames: 0,
  peopleAnimateMs: 0,
  animalRebuilds: 0,
  animalRebuildMs: 0,
  animalFrames: 0,
  animalAnimateMs: 0,
}
