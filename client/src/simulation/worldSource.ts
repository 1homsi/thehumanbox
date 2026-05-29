export type WorldSource = 'remote' | 'wasm'

const SOURCE_KEY = 'thb-world-source'
const SEED_KEY = 'thb-wasm-seed'
export const OWN_WORLD_ID = 'browser-own'

export function getWorldSource(): WorldSource {
  if (typeof window === 'undefined') return 'remote'
  try {
    return window.localStorage.getItem(SOURCE_KEY) === 'wasm' ? 'wasm' : 'remote'
  } catch {
    return 'remote'
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
