import { terrainVisualSignature } from '../../../model/terrain-visuals'

/**
 * Tells when the static ground sprites (trees, decor, mountains) must be rebuilt.
 * The wire re-sends the tile grid every so often with a new array identity but
 * usually identical ground, so identity alone would rebuild needlessly: a changed
 * array is hashed (the same signature the canvas base layer uses) and compared.
 *
 * A rebuild redraws the whole map's ground layers (tens of ms on a grown world). At normal speed the
 * ground changes every few seconds, but a fast-forwarded world changes it on nearly every frame, and
 * rebuilding each time made the map stutter. `minIntervalMs` spaces the rebuilds out: a change that comes
 * sooner is held (`pending`) and announced once the interval has passed. The first terrain, a new grid
 * shape and a turned season are announced at once.
 */
export class TerrainWatch {
  private tiles: ArrayLike<number>[] | null = null
  private biomes: ArrayLike<number>[] | null = null
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
  /** A change is held back until `minIntervalMs` has passed since the last announced one. */
  pending = false
  private lastBumpAt = -Infinity
  private readonly minIntervalMs: number

  constructor(minIntervalMs = 0) {
    this.minIntervalMs = minIntervalMs
  }

  /** Announce a held change once the interval has passed; true when it did. */
  private flush(now: number): boolean {
    if (!this.pending || now - this.lastBumpAt < this.minIntervalMs) return false
    this.pending = false
    this.lastBumpAt = now
    this.revision++
    return true
  }

  update(
    tiles: ArrayLike<number>[] | undefined,
    biomes: ArrayLike<number>[] | undefined,
    width: number,
    height: number,
    originX: number,
    originY: number,
    season: string,
    now: number = performance.now(),
  ): boolean {
    if (!tiles || !biomes || tiles.length < height) return false
    const sameShape =
      this.width === width && this.height === height && this.originX === originX && this.originY === originY
    if (sameShape && tiles === this.tiles && biomes === this.biomes && season === this.season) {
      return this.flush(now)
    }
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
    const urgent = !sameShape || this.tiles === null || season !== this.season
    this.tiles = tiles
    this.biomes = biomes
    this.signature = signature
    this.season = season
    this.width = width
    this.height = height
    this.originX = originX
    this.originY = originY
    if (unchanged) return this.flush(now)
    this.pending = true
    if (urgent) this.lastBumpAt = -Infinity
    return this.flush(now)
  }
}

/** Biomes are re-sent with the tiles; compare by content only when the array changed. */
function sameBiomes(a: ArrayLike<number>[], b: ArrayLike<number>[] | null): boolean {
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
