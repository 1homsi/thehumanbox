// The tour library (shepherd.js, ~45 kB) is only needed when someone starts the
// tour, so it lives in tour-runner.ts and is fetched on demand. Its stylesheet stays
// here: it is tiny and must keep loading before the app styles that override it.
import 'shepherd.js/dist/css/shepherd.css'
import { logger } from '../../shared/logger'
import type { PlayerWorldKind } from '../../simulation/worldSource'

const TOUR_KEY = 'thb-tour-completed-v1'

export function isTourSupported(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return !window.matchMedia('(max-width: 767px)').matches
  } catch {
    return true
  }
}

export function markSeen() {
  try {
    window.localStorage.setItem(TOUR_KEY, '1')
  } catch {
    /* ignore */
  }
}

const loadRunner = () => import('./tour-runner')

/** Starts fetching the tour code ahead of a likely start (the welcome flow). */
export function preloadTour() {
  if (isTourSupported()) void loadRunner().catch(() => undefined)
}

export function startTour(worldKind: PlayerWorldKind = 'local') {
  if (!isTourSupported()) {
    markSeen()
    return
  }
  loadRunner()
    .then((m) => m.runTour(worldKind))
    .catch((error: unknown) => logger.error('tour', 'could not start the tour', error))
}
