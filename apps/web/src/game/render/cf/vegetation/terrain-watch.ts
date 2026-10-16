import { terrainGroundSignature, terrainVisualSignature } from '../../../model/terrain-visuals'

/**
 * Tells when the static ground sprites (trees, decor, mountains) must be rebuilt.
 * The wire re-sends the tile grid every so often with a new array identity but
 * usually identical ground, so identity alone would rebuild needlessly: a changed
 * array is hashed and compared.
 *
 * Two revisions come out of one grid. `revision` moves with the ground (water, rock,
 * snow, biome, season); `occupancyRevision` also moves when a fire, campfire, hut or
 * mineral tile changes, which only the trees, decor, patches, cattails and settlement
 * marks read. A fire lit or a hut raised does not rebuild the shore, the foam or the lilies.
 */
export class TerrainWatch {
  private tiles: number[][] | null = null
  private biomes: number[][] | null = null
  private season = ''
  private groundSignature = 0
  private occupancySignature = 0
  private width = 0
  private height = 0
  private originX = 0
  private originY = 0
  /** Bumped on every ground change (and on a biome or season change). */
  revision = 0
  /** Bumped on every change `revision` sees, and on every occupancy change. */
  occupancyRevision = 0
  /** Milliseconds spent hashing, for the stats. */
  hashMs = 0

  /** True when either revision moved. */
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
    let ground = this.groundSignature
    let occupancy = this.occupancySignature
    if (!sameShape || tiles !== this.tiles) {
      const t0 = performance.now()
      ground = terrainGroundSignature(tiles, width, height)
      occupancy = terrainVisualSignature(tiles, width, height)
      this.hashMs += performance.now() - t0
    }
    const context =
      sameShape &&
      this.tiles !== null &&
      (biomes === this.biomes || sameBiomes(biomes, this.biomes)) &&
      season === this.season
    const groundUnchanged = context && ground === this.groundSignature
    const occupancyUnchanged = context && occupancy === this.occupancySignature
    this.tiles = tiles
    this.biomes = biomes
    this.groundSignature = ground
    this.occupancySignature = occupancy
    this.season = season
    this.width = width
    this.height = height
    this.originX = originX
    this.originY = originY
    if (!groundUnchanged) this.revision++
    if (!occupancyUnchanged) this.occupancyRevision++
    return !groundUnchanged || !occupancyUnchanged
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
