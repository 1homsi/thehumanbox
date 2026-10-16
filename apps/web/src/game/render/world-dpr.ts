/**
 * The world canvas draws at most this many backing pixels per CSS pixel (`<Game maxDpr>`).
 * Everything that reasons about the map's device pixels - the canvas itself and the terrain
 * level of detail - uses this bound, not the screen's `devicePixelRatio`.
 */
export const WORLD_MAX_DPR = 2
