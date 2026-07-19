export type WorldSource = 'remote' | 'wasm'
export type PlayerWorldKind = 'local' | 'shared'
export type DesktopWorldMode = 'local' | 'remote' | null | undefined

const SOURCE_KEY = 'thb-world-source'
const SEED_KEY = 'thb-wasm-seed'
const RESET_KEY = 'thb-wasm-reset-pending'
const RECOVERY_KEY = 'thb-wasm-recovery-pending'
export const LOCAL_WORLD_CHECKPOINT_EVENT = 'thb:local-world-checkpoint'
export const LOCAL_WORLD_RELOAD_EVENT = 'thb:local-world-safe-reload'
export const OWN_WORLD_ID = 'browser-own'

export type LocalWorldReloadOperation = 'reload' | 'source-switch' | 'reset' | 'recovery'

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
  if (stored === 'remote') return 'remote'
  if (stored === 'wasm') return 'wasm'

  // The desktop renderer talks to the native simulation selected in
  // Desktop Settings (local by default). The standalone web app starts
  // a private in-browser world and never contacts the shared server
  // unless the player explicitly opts into it.
  return desktop ? 'remote' : 'wasm'
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
  if (source === 'wasm' || options.fellBackToLocal) return 'local'

  // A browser `remote` source is always the explicitly selected Shared World.
  // Localhost can be a development server, so it must not change that identity.
  if (!options.desktop) return 'shared'

  // Desktop Settings is authoritative once loaded. Before it resolves, the
  // bundled native API is local while an externally configured API is shared.
  if (options.desktopMode === 'local') return 'local'
  if (options.desktopMode === 'remote') return 'shared'
  return options.localServer ? 'local' : 'shared'
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

export function shouldCheckpointSourceSwitch(current: WorldSource, next: WorldSource): boolean {
  return current === 'wasm' && next === 'remote'
}

/**
 * Give an active browser-local worker the first chance to durably save and
 * release its Web Lock. Remote/native pages have no listener and reload
 * immediately. This also catches temporary WASM fallback worlds whose stored
 * source still says `remote`.
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

export function setWorldSourceAndReload(next: WorldSource) {
  const current = getWorldSource()
  let previous: string | null = null
  try {
    previous = window.localStorage.getItem(SOURCE_KEY)
    window.localStorage.setItem(SOURCE_KEY, next)
  } catch {
    /* noop */
  }
  if (shouldCheckpointSourceSwitch(current, next)) {
    const rollback = () => {
      try {
        if (previous === null) window.localStorage.removeItem(SOURCE_KEY)
        else window.localStorage.setItem(SOURCE_KEY, previous)
      } catch {
        /* noop */
      }
    }
    reloadAppSafely({
      operation: 'source-switch',
      onFailure: rollback,
      failureMessage: 'could not checkpoint the current world; going online was cancelled safely',
      requireLocalWorld: true,
      unavailableMessage: 'The local world is still loading. Wait a moment, then try going online again.',
    })
    return
  }
  reloadAppSafely()
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
