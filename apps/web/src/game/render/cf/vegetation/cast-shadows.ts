import type { WorldState } from '../../../../shared/types'

/**
 * Where the sun throws a tree's shadow. The day runs from dawn (the sun low in the east) to
 * dusk (low in the west): a shadow points away from the sun, is long when the sun is low and
 * short at noon, and fades to nothing at dawn, dusk and night. The model reads only the world's
 * day progress and day flag, so the shadows agree with the sky tints in `atmosphere.ts`.
 */

/** Day progress at which the sun sets (the sky tints darken from here on). */
export const SUNSET_PROGRESS = 0.6
/** Shadows get no longer than this many tree sizes. */
const MAX_LENGTH = 3.2
/** Shadows stop being drawn when the sun is this low (0..1 of its height). */
const MIN_ELEVATION = 0.1

export interface CastSun {
  /** Unit direction the shadow points in (away from the sun), world px. */
  dx: number
  dy: number
  /** Shadow length in tree sizes. */
  length: number
  /** Opacity of the shadow, 0..1. */
  alpha: number
  /** Quantised key, so a caller rewrites its sprites only when the sun has moved on. */
  key: number
}

/** The sun for this world, or null when no shadow should be drawn (night, dawn and dusk edges). */
export function castSun(world: Pick<WorldState, 'is_day' | 'day_progress'>): CastSun | null {
  if (!world.is_day) return null
  const p = Math.max(0, Math.min(1, (world.day_progress ?? 0.5) / SUNSET_PROGRESS))
  const elevation = Math.sin(Math.PI * p)
  if (elevation < MIN_ELEVATION) return null
  // Shadows point west at dawn (the sun is in the east) and east at dusk; the map looks down
  // from the north, so they also fall a little south.
  const ex = -Math.cos(Math.PI * p)
  const ey = 0.35
  const norm = Math.hypot(ex, ey)
  return {
    dx: ex / norm,
    dy: ey / norm,
    length: Math.min(MAX_LENGTH, 0.9 / Math.max(elevation, 0.28)),
    alpha: 0.26 * Math.min(1, elevation * 2),
    key: Math.round(p * 240),
  }
}
