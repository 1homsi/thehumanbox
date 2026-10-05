import type { WorldState } from '../../../shared/types'
import { rgba } from './frame'

type Overlay = readonly [number, number, number, number]

/**
 * The canvas painter lays translucent colour over the terrain (and everything baked
 * into it) for night, dawn and dusk. Ground sprites now sit above that canvas, so
 * they would stay bright at night. SpriteLayer has no overlay blend, only a per-sprite
 * multiply tint, so this approximates each overlay `rgba(c, a)` as a multiply by
 * `(1 - a) + a * c / 128` (exact for a mid-grey pixel), clamped to 1 because a
 * multiply cannot brighten. Season and weather tints are not modelled.
 */
export function atmosphereOverlays(world: Pick<WorldState, 'is_day' | 'day_progress'>): Overlay[] {
  const dp = world.day_progress ?? 0.5
  if (!world.is_day) {
    const mid = Math.max(0, 1 - Math.abs(dp - 0.85) * 4)
    return [
      [14, 20, 58, 0.22 + mid * 0.1],
      [80, 110, 200, 0.05 + mid * 0.03],
    ]
  }
  if (dp < 0.12) {
    const k = (0.12 - dp) / 0.12
    return [
      [255, 160, 80, k * 0.14],
      [120, 80, 160, k * 0.06],
    ]
  }
  if (dp > 0.55) {
    const k = Math.min(1, (dp - 0.55) / 0.15)
    return [
      [235, 120, 60, k * 0.15],
      [150, 70, 140, k * 0.05],
    ]
  }
  return []
}

/** 0xRRGGBBAA multiply tint for ground-level sprites, quantised so it rarely changes. */
export function groundTint(world: Pick<WorldState, 'is_day' | 'day_progress'>): number {
  const f = [1, 1, 1]
  for (const [r, g, b, a] of atmosphereOverlays(world)) {
    const c = [r, g, b]
    for (let i = 0; i < 3; i++) f[i] *= 1 - a + (a * c[i]) / 128
  }
  const q = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 31) * 8 + 7
  return rgba(Math.min(255, q(f[0])), Math.min(255, q(f[1])), Math.min(255, q(f[2])), 255)
}
