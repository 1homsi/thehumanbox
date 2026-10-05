/**
 * Opt-in timing samples for the terrain backends, read by the comparison harness
 * (`terrain-spike.html`). Off by default: recording is one boolean check.
 */
export const terrainProbe = {
  enabled: false,
  /** Milliseconds per world-texture paint (the 2D canvas painter, including the base blit). */
  paint: [] as number[],
  /** Milliseconds per TileLayer terrain sync, with what it did. */
  sync: [] as Array<{ kind: string; ms: number; tiles: number }>,
  reset() {
    this.paint.length = 0
    this.sync.length = 0
  },
}
