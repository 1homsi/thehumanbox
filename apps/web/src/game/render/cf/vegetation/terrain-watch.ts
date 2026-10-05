import { terrainVisualSignature } from '../../../model/terrain-visuals'

/**
 * Tells when the static ground sprites (trees, decor, mountains) must be rebuilt.
 * The wire re-sends the tile grid every so often with a new array identity but
 * usually identical ground, so identity alone would rebuild needlessly: a changed
 * array is hashed (the same signature the canvas base layer uses) and compared.
 */
export class TerrainWatch {
  private tiles: number[][] | null = null
  private biomes: number[][] | null = null
  private season = ''
  private signature = 0
  private width = 0
  private height = 0
  private originX = 0
  private originY = 0
  /** Bumped on every rebuild-worthy change. */
  revision = 0
  /** Milliseconds spent hashing, for the stats. */
  hashMs = 0

  update(
    tiles: number[][] | undefined,
    biomes: number[][] | undefined,
    width: number,
    height: number,
    originX: number,
    originY: number,
    season: string,
  ): boolean {
    if (!tiles || !biomes || tiles.length < height) return false
    const sameShape =
      this.width === width && this.height === height && this.originX === originX && this.originY === originY
    if (sameShape && tiles === this.tiles && biomes === this.biomes && season === this.season) return false
    let signature = this.signature
    if (!sameShape || tiles !== this.tiles) {
      const t0 = performance.now()
      signature = terrainVisualSignature(tiles, width, height)
      this.hashMs += performance.now() - t0
    }
    const unchanged =
      sameShape &&
      this.tiles !== null &&
      signature === this.signature &&
      (biomes === this.biomes || sameBiomes(biomes, this.biomes)) &&
      season === this.season
    this.tiles = tiles
    this.biomes = biomes
    this.signature = signature
    this.season = season
    this.width = width
    this.height = height
    this.originX = originX
    this.originY = originY
    if (unchanged) return false
    this.revision++
    return true
  }
}

/** Biomes are re-sent with the tiles; compare by content only when the array changed. */
function sameBiomes(a: number[][], b: number[][] | null): boolean {
  if (!b || a.length !== b.length) return false
  for (let y = 0; y < a.length; y++) {
    const ra = a[y]
    const rb = b[y]
    if (ra === rb) continue
    if (!ra || !rb || ra.length !== rb.length) return false
    for (let x = 0; x < ra.length; x++) if (ra[x] !== rb[x]) return false
  }
  return true
}
