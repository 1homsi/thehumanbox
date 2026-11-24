/** How a page load should open the player's world. */
export type WorldStartMode = 'resume' | 'year_one' | 'head_start' | 'head_start_reddit' | 'empty'

export interface WorldStartInput {
  /** `location.search`, including the leading `?` when the browser provides one. */
  search: string
  /** `document.referrer`. */
  referrer: string
  /** A durable save exists and this load is not asking to replace it. */
  hasSavedWorld: boolean
  /** Settings → World asked to replace the world with a new year-one world. */
  explicitReset: boolean
  /** Settings → World asked for an empty world. Wins over every other start. */
  explicitEmpty: boolean
  /** Settings → World asked for a head-start world. */
  explicitHeadStart: boolean
}

/** True when `utm_source` is Reddit, ignoring case and surrounding space. */
export function isRedditUtmSource(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  const source = new URLSearchParams(query).get('utm_source')
  return source !== null && source.trim().toLowerCase() === 'reddit'
}

/** True when the referring page is reddit.com or one of its subdomains. */
export function isRedditReferrer(referrer: string): boolean {
  if (!referrer) return false
  try {
    const host = new URL(referrer).hostname.toLowerCase()
    return host === 'reddit.com' || host.endsWith('.reddit.com')
  } catch {
    return false
  }
}

export function isRedditArrival(search: string, referrer: string): boolean {
  return isRedditUtmSource(search) || isRedditReferrer(referrer)
}

/**
 * Which world to open.
 * A saved world resumes. An explicit Settings choice (empty, head start, or a plain new year-one
 * world) wins over a Reddit landing. A Reddit arrival with nothing saved and no choice uses the
 * head-start world. Everyone else starts at year one.
 */
export function resolveWorldStart(input: WorldStartInput): WorldStartMode {
  const replacing = input.explicitReset || input.explicitEmpty || input.explicitHeadStart
  if (input.hasSavedWorld && !replacing) return 'resume'
  if (input.explicitEmpty) return 'empty'
  if (input.explicitHeadStart) return 'head_start'
  if (input.explicitReset) return 'year_one'
  if (isRedditArrival(input.search, input.referrer)) return 'head_start_reddit'
  return 'year_one'
}

/** A fresh world (no save to resume) should be planted with the head-start language. */
export function freshWorldUsesHeadStart(mode: WorldStartMode): boolean {
  return mode === 'head_start' || mode === 'head_start_reddit'
}
