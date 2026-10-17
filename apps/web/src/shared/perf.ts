export const IS_MOBILE: boolean =
  typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 767px)').matches

/** A touch-first device (phone in any orientation, tablet): no mouse or trackpad is the primary input. */
const IS_TOUCH_DEVICE: boolean =
  typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse) and (hover: none)').matches

export const LOW_PERF: boolean = (() => {
  if (typeof window === 'undefined') return false
  if (IS_MOBILE || IS_TOUCH_DEVICE) return true
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('perf') === 'low') return true
    if (window.localStorage?.getItem('thb-perf') === 'low') return true
  } catch {
    /* ignore */
  }
  const cores = (navigator as Navigator & { hardwareConcurrency?: number }).hardwareConcurrency ?? 8
  if (cores < 6) return true
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  if (memory != null && memory < 4) return true
  return false
})()
