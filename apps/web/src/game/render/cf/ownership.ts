import { cfFlag } from './flags'

// What the cubeforge layers own, so the canvas painter knows what to skip.
const owned = new Set<string>()

/**
 * The canvas painter must skip what cubeforge layers draw, but only while those
 * layers are really mounted: if WebGL fails and the 2D fallback takes over, the
 * claim is released and the canvas draws everything again.
 */
export function claimCf(names: readonly string[]): () => void {
  for (const n of names) owned.add(n)
  return () => {
    for (const n of names) owned.delete(n)
  }
}

export function cfOwns(name: string): boolean {
  return owned.has(name)
}

/**
 * The parts of the map that cubeforge layers draw above the canvas sprite. While
 * the canvas still paints people, animals, effects and the HUD, any of these
 * needs a second, transparent canvas sprite above the layers (and the first one
 * below them) so that people still walk in front of buildings and trees.
 */
export function cfSplitCanvas(): boolean {
  return cfFlag('buildings') || cfFlag('vegetation') || cfFlag('landuse')
}

/** Which parts of the map the cubeforge layers own, from `?cf=`. */
export function cfPartsEnabled() {
  return {
    buildings: cfFlag('buildings'),
    vegetation: cfFlag('vegetation'),
    landuse: cfFlag('landuse'),
  }
}
