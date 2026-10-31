/** PostHog's US ingest host, which the desktop app sends to directly. */
export const POSTHOG_US_HOST = 'https://us.i.posthog.com'
/** PostHog's US app host, for links back into PostHog (the toolbar and similar). */
export const POSTHOG_UI_HOST = 'https://us.posthog.com'
/** Where the website's own origin forwards to PostHog (functions/ingest/[[path]].ts). */
export const POSTHOG_PROXY_PATH = '/ingest'

export interface AnalyticsHost {
  api_host: string
  ui_host?: string
}

/**
 * Where analytics is sent. The website sends through its own origin, so the browser never makes a
 * cross-origin request to PostHog: the threaded simulation runs on a cross-origin isolated page, and PostHog's
 * own scripts and hosts would be blocked there. The desktop app loads from disk, where a relative path has no
 * server behind it, so it keeps the absolute host. VITE_POSTHOG_HOST, when set, overrides both.
 */
export function analyticsHost(input: { override?: string; desktop: boolean; origin: string }): AnalyticsHost {
  const override = input.override?.trim()
  if (override) return { api_host: override }
  if (input.desktop) return { api_host: POSTHOG_US_HOST }
  return { api_host: input.origin + POSTHOG_PROXY_PATH, ui_host: POSTHOG_UI_HOST }
}
