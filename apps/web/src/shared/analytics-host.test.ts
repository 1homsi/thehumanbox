import { describe, expect, it } from 'vitest'
import { POSTHOG_PROXY_PATH, POSTHOG_UI_HOST, POSTHOG_US_HOST, analyticsHost } from './analytics-host'

const ORIGIN = 'https://thehumanbox.com'

describe('analyticsHost', () => {
  it('sends the website through its own origin, so no request leaves for PostHog', () => {
    expect(analyticsHost({ desktop: false, origin: ORIGIN })).toEqual({
      api_host: ORIGIN + POSTHOG_PROXY_PATH,
      ui_host: POSTHOG_UI_HOST,
    })
  })

  it('keeps the absolute PostHog host in the desktop app, which loads from disk', () => {
    expect(analyticsHost({ desktop: true, origin: 'null' })).toEqual({ api_host: POSTHOG_US_HOST })
  })

  it('takes the VITE_POSTHOG_HOST override over either default', () => {
    expect(analyticsHost({ override: 'https://eu.i.posthog.com', desktop: false, origin: ORIGIN })).toEqual({
      api_host: 'https://eu.i.posthog.com',
    })
    expect(analyticsHost({ override: '  ', desktop: true, origin: 'null' })).toEqual({
      api_host: POSTHOG_US_HOST,
    })
  })
})
