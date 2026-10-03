let query: MediaQueryList | null | undefined
let reduced = false

function ensure(): void {
  if (query !== undefined) return
  try {
    query =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null
  } catch {
    query = null
  }
  if (!query) return
  reduced = query.matches
  query.addEventListener?.('change', (e) => {
    reduced = e.matches
  })
}

/** True when the player asked their system for less motion. */
export function prefersReducedMotion(): boolean {
  ensure()
  return reduced
}

/**
 * The clock for decorative map animation: real time normally, frozen at zero
 * for players who asked for less motion, so wards, smoke, dust and traffic
 * hold still instead of drifting.
 */
export function motionTime(t: number): number {
  return prefersReducedMotion() ? 0 : t
}

/** Test hook: forget the cached media query. */
export function resetMotionForTests(): void {
  query = undefined
  reduced = false
}
