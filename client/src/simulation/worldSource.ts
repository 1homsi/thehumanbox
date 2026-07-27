export type WorldSource = 'native' | 'wasm'
export type PlayerWorldKind = 'local'
export type DesktopWorldMode = 'local' | null | undefined

const SOURCE_KEY = 'thb-world-source'
const SEED_KEY = 'thb-wasm-seed'
const RESET_KEY = 'thb-wasm-reset-pending'
const RECOVERY_KEY = 'thb-wasm-recovery-pending'
export const LOCAL_WORLD_CHECKPOINT_EVENT = 'thb:local-world-checkpoint'
export const LOCAL_WORLD_RELOAD_EVENT = 'thb:local-world-safe-reload'
export const OWN_WORLD_ID = 'browser-own'

export type LocalWorldReloadOperation = 'reload' | 'reset' | 'recovery'

export interface LocalWorldReloadDetail {
  operation: LocalWorldReloadOperation
  onFailure?: () => void
  failureMessage?: string
}

interface AppReloadOptions extends Partial<LocalWorldReloadDetail> {
  /** Destructive local-world operations must never reload without a live worker. */
  requireLocalWorld?: boolean
  unavailableMessage?: string
}

export function resolveWorldSource(stored: string | null, desktop: boolean): WorldSource {
  void stored
  // Electron talks only to its bundled native simulation. A standalone
  // browser always runs the simulation worker and ignores legacy preferences.
  return desktop ? 'native' : 'wasm'
}

export function resolvePlayerWorldKind(
  source: WorldSource,
  options: {
    desktop: boolean
    desktopMode?: DesktopWorldMode
    localServer: boolean
    fellBackToLocal?: boolean
  },
): PlayerWorldKind {
  void source
  void options
  return 'local'
}

export function shouldUseSimulationApi(source: WorldSource): boolean {
  return source === 'native'
}

export function getWorldSource(): WorldSource {
  if (typeof window === 'undefined') return 'wasm'
  try {
    return resolveWorldSource(window.localStorage.getItem(SOURCE_KEY), !!window.thbDesktop)
  } catch {
    return resolveWorldSource(null, !!window.thbDesktop)
  }
}

/**
 * Give an active browser-local worker the first chance to durably save and
 * release its Web Lock. Native pages have no listener and reload immediately.
 * This also catches temporary WASM fallback worlds.
 */
export function reloadAppSafely(options: AppReloadOptions = {}): boolean {
  const detail: LocalWorldReloadDetail = {
    operation: options.operation ?? 'reload',
    onFailure: options.onFailure,
    failureMessage: options.failureMessage,
  }
  const event = new CustomEvent<LocalWorldReloadDetail>(LOCAL_WORLD_RELOAD_EVENT, {
    cancelable: true,
    detail,
  })
  if (!window.dispatchEvent(event)) return true

  if (options.requireLocalWorld) {
    options.onFailure?.()
    window.alert(
      options.unavailableMessage ??
        'The local world is still loading. Wait a moment, then try refreshing again.',
    )
    return false
  }

  window.location.reload()
  return true
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
    window.localStorage.removeItem(RECOVERY_KEY)
  } catch {
    /* noop */
  }
  clearOwnWorldSeed()
  reloadAppSafely({
    operation: 'reset',
    onFailure: clearOwnWorldResetRequest,
    failureMessage: 'could not checkpoint the current world; reset was cancelled safely',
    requireLocalWorld: true,
    unavailableMessage:
      'The local world is still loading. Wait a moment, then try starting a new world again.',
  })
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

export function requestOwnWorldRecovery(recoveryId: string) {
  try {
    window.localStorage.setItem(RECOVERY_KEY, recoveryId)
    window.localStorage.removeItem(RESET_KEY)
  } catch {
    /* noop */
  }
  reloadAppSafely({
    operation: 'recovery',
    onFailure: clearOwnWorldRecoveryRequest,
    failureMessage: 'could not checkpoint the current world; restore was cancelled safely',
    requireLocalWorld: true,
    unavailableMessage: 'The local world is still loading. Wait a moment, then try restoring again.',
  })
}

export function requestOwnWorldCheckpoint(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(ok)
    }
    const timer = window.setTimeout(() => finish(false), 8_000)
    const event = new CustomEvent<{ resolve: (ok: boolean) => void }>(LOCAL_WORLD_CHECKPOINT_EVENT, {
      cancelable: true,
      detail: { resolve: finish },
    })
    if (window.dispatchEvent(event)) finish(false)
  })
}

export function getOwnWorldRecoveryRequest(): string | null {
  try {
    return window.localStorage.getItem(RECOVERY_KEY)
  } catch {
    return null
  }
}

export function clearOwnWorldRecoveryRequest() {
  try {
    window.localStorage.removeItem(RECOVERY_KEY)
  } catch {
    /* noop */
  }
}
