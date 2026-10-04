/**
 * Opt-in switches for the cubeforge-backed renderer, so each migrated layer can be
 * tried on its own while the canvas painters stay the default.
 *
 * Enable with `?cf=overlays,effects` in the URL, or `localStorage['thb-cf'] = 'overlays,effects'`.
 * `all` (or `1`) turns every flag on. Names are free-form, so each migration owns its own
 * (`terrain`, `people`, `buildings`, `atmosphere`, `overlays`, `effects`, `hud`, `roads`, ...).
 */

const STORAGE_KEY = 'thb-cf'

let cachedRaw: string | null = null
let cachedSet: ReadonlySet<string> = new Set()
let storedRaw: string | null | undefined

function readStored(): string | null {
  if (storedRaw !== undefined) return storedRaw
  try {
    storedRaw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY)
  } catch {
    storedRaw = null
  }
  return storedRaw
}

function readUrl(): string | null {
  try {
    if (typeof location === 'undefined') return null
    return new URLSearchParams(location.search).get('cf')
  } catch {
    return null
  }
}

function parse(raw: string): ReadonlySet<string> {
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
}

/** The enabled flag names. The URL wins over local storage; both are re-read cheaply. */
export function cfFlags(): ReadonlySet<string> {
  const raw = readUrl() ?? readStored() ?? ''
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedSet = parse(raw)
  }
  return cachedSet
}

/** True when the named cubeforge migration is switched on. */
export function cfFlag(name: string): boolean {
  const flags = cfFlags()
  if (flags.size === 0) return false
  return flags.has(name.toLowerCase()) || flags.has('all') || flags.has('1') || flags.has('true')
}

/** For tests: forget cached state so the next read sees the current URL and storage. */
export function resetCfFlagsForTests(): void {
  cachedRaw = null
  cachedSet = new Set()
  storedRaw = undefined
}
