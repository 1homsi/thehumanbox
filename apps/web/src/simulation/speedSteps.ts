/**
 * The speeds the slower and faster buttons step through, in multiples of normal speed: finer than the
 * preset tiles (a quarter speed, and eight and twenty times as well), from a quarter to forty times.
 */
export const SPEED_STEPS = [0.25, 0.5, 1, 2, 4, 8, 10, 20, 40] as const

// A speed within this factor of a step counts as being on it, so 1.0000001 steps like 1.
const ON_STEP = 1.0001

/**
 * The next speed from `current` in `direction` (up is faster), or null when there is none in that
 * direction. A speed between two steps steps to the nearest one in the direction asked for.
 */
export function nextSpeedStep(current: number, direction: 1 | -1): number | null {
  if (!Number.isFinite(current) || current <= 0) return null
  if (direction > 0) {
    return SPEED_STEPS.find((step) => step > current * ON_STEP) ?? null
  }
  let below: number | null = null
  for (const step of SPEED_STEPS) if (step < current / ON_STEP) below = step
  return below
}
