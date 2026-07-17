export type WorldSource = 'remote' | 'wasm'

const SOURCE_KEY = 'thb-world-source'
const SEED_KEY = 'thb-wasm-seed'
const RESET_KEY = 'thb-wasm-reset-pending'
export const OWN_WORLD_ID = 'browser-own'

export function resolveWorldSource(stored: string | null, desktop: boolean): WorldSource {
  if (stored === 'remote') return 'remote'
  if (stored === 'wasm') return 'wasm'

  // The desktop renderer talks to the native simulation selected in
  // Desktop Settings (local by default). The standalone web app starts
  // a private in-browser world and never contacts the shared server
  // unless the player explicitly opts into it.
  return desktop ? 'remote' : 'wasm'
}

export function shouldShowIdleResume(idleParked: boolean, localRuntime: boolean): boolean {
  return idleParked && !localRuntime
}

export function shouldUseSimulationApi(source: WorldSource): boolean {
  // Desktop's normal `remote` source is its native local API. An explicit
  // WASM source always gets details from that same in-browser simulation.
  return source === 'remote'
}

export function getWorldSource(): WorldSource {
  if (typeof window === 'undefined') return 'wasm'
  try {
    return resolveWorldSource(window.localStorage.getItem(SOURCE_KEY), !!window.thbDesktop)
  } catch {
    return resolveWorldSource(null, !!window.thbDesktop)
  }
}

export function setWorldSourceAndReload(next: WorldSource) {
  try {
    window.localStorage.setItem(SOURCE_KEY, next)
  } catch {
    /* noop */
  }
  window.location.reload()
}

export function getOwnWorldSeed(): string {
  if (typeof window === 'undefined') return '42'
  try {
    const existing = window.localStorage.getItem(SEED_KEY)
    if (existing && /^\d+$/.test(existing)) return existing
  } catch {
    return '42'
  }
  const buf = new BigUint64Array(1)
  crypto.getRandomValues(buf)
  const seed = buf[0].toString()
  try {
    window.localStorage.setItem(SEED_KEY, seed)
  } catch {
    /* noop */
  }
  return seed
}

export function clearOwnWorldSeed() {
  try {
    window.localStorage.removeItem(SEED_KEY)
  } catch {
    /* noop */
  }
}

export function requestOwnWorldReset() {
  try {
    window.localStorage.setItem(RESET_KEY, '1')
  } catch {
    /* noop */
  }
  clearOwnWorldSeed()
  window.location.reload()
}

export function hasOwnWorldResetRequest(): boolean {
  try {
    return window.localStorage.getItem(RESET_KEY) === '1'
  } catch {
    return false
  }
}

export function clearOwnWorldResetRequest() {
  try {
    window.localStorage.removeItem(RESET_KEY)
  } catch {
    /* noop */
  }
}
