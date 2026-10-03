import { reloadAppSafely } from '../simulation/worldSource'

/** Whether the player chose low-performance mode (see LOW_PERF in perf.ts). */
export function readLowPerf(): boolean {
  try {
    return window.localStorage?.getItem('thb-perf') === 'low'
  } catch {
    return false
  }
}

/** Flip low-performance mode. It is read at startup, so this reloads safely. */
export function toggleLowPerf() {
  let wasLowPerf = false
  try {
    wasLowPerf = readLowPerf()
    if (wasLowPerf) window.localStorage.removeItem('thb-perf')
    else window.localStorage.setItem('thb-perf', 'low')
  } catch {
    return
  }
  reloadAppSafely({
    onFailure: () => {
      try {
        if (wasLowPerf) window.localStorage.setItem('thb-perf', 'low')
        else window.localStorage.removeItem('thb-perf')
      } catch {
        /* keep the current renderer mode if storage became unavailable */
      }
    },
    failureMessage: 'could not checkpoint the current world; performance-mode refresh was cancelled safely',
  })
}
