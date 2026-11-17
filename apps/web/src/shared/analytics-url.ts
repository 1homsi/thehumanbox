import type { CaptureResult } from 'posthog-js'

const PRIVATE_PARAMS = ['token', 'api']

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

export function scrubEventUrls(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event
  scrub(event.properties)
  scrub(event.$set)
  scrub(event.$set_once)
  return event
}
