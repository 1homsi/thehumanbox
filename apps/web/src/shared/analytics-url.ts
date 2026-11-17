import type { CaptureResult } from 'posthog-js'

/**
 * Query parameters never sent to analytics. The desktop app loads its page with the local API's address and its
 * per-launch token in the query (`?desktop=1&api=127.0.0.1:39543&token=…`), and PostHog copies the page URL into
 * every event (#953).
 */
const PRIVATE_PARAMS = ['token', 'api']

/** The URL with the private parameters taken out; anything that is not such a URL comes back as it was. */
export function stripPrivateParams(value: string): string {
  if (!PRIVATE_PARAMS.some((name) => value.includes(`${name}=`))) return value
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return value
  }
  let changed = false
  for (const name of PRIVATE_PARAMS) {
    if (url.searchParams.has(name)) {
      url.searchParams.delete(name)
      changed = true
    }
  }
  return changed ? url.toString() : value
}

function scrub(props: Record<string, unknown> | undefined): void {
  if (!props) return
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'string') props[key] = stripPrivateParams(value)
  }
}

/**
 * PostHog `before_send`: takes the private parameters out of every URL an event carries, in its properties
 * (`$current_url`, `$referrer`, …) and in the person properties it sets (`$initial_current_url`, …).
 */
export function scrubEventUrls(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event
  scrub(event.properties)
  scrub(event.$set)
  scrub(event.$set_once)
  return event
}
