/**
 * The speeds the slower and faster buttons step through, in multiples of normal speed. Each is at least
 * twice the last, so every press is a change the eye can see, and they run from a quarter to the top of
 * the speed list (5000×), so the buttons alone reach every speed the list offers.
 */
export const SPEED_STEPS = [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 500, 5000] as const

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

const FRACTIONS: Record<number, string> = { 0.25: '¼', 0.5: '½' }

/** A speed as the time control shows it: `½×`, `1×`, `40×`. */
export function formatSpeed(speed: number): string {
  const whole = Number.isInteger(speed) ? speed.toFixed(0) : String(speed)
  return `${FRACTIONS[speed] ?? whole}×`
}

/** The speed a world is really reaching, for the readout: whole numbers from 10×, one decimal below. */
export function formatAchievedSpeed(achieved: number): string {
  if (achieved >= 10) return formatSpeed(Math.round(achieved))
  return formatSpeed(Math.max(0.1, Math.round(achieved * 10) / 10))
}
