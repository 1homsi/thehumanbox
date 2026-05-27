import posthog from 'posthog-js'

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com'

let initialized = false

export function initAnalytics(): void {
  if (initialized) return
  if (!KEY) return
  if (typeof window === 'undefined') return
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return
  }
  posthog.init(KEY, {
    api_host: HOST,
    person_profiles: 'identified_only',
    capture_pageview: 'history_change',
    capture_pageleave: true,
    autocapture: false,
    capture_exceptions: false,
    disable_session_recording: true,
  })
  initialized = true
}

export function trackEvent(name: string, props?: Record<string, unknown>): void {
  if (!initialized) return
  posthog.capture(name, props)
}

export function identifyUser(id: string, traits?: Record<string, unknown>): void {
  if (!initialized) return
  posthog.identify(id, traits)
}

export function analyticsReady(): boolean {
  return initialized
}
