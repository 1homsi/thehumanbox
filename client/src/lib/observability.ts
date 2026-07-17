import type posthogType from 'posthog-js'
import { getWorldSource } from '../simulation/worldSource'

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com'

let client: typeof posthogType | null = null
let loading = false
const queued: Array<() => void> = []

export function initAnalytics(): void {
  if (client || loading) return
  if (!KEY) return
  if (typeof window === 'undefined') return
  if (!window.thbDesktop && getWorldSource() === 'wasm') return
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return
  }
  loading = true
  void import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(KEY, {
        api_host: HOST,
        person_profiles: 'identified_only',
        capture_pageview: 'history_change',
        capture_pageleave: true,
        autocapture: false,
        capture_exceptions: false,
        capture_performance: false,
        disable_session_recording: true,
      })
      client = posthog
      for (const fn of queued.splice(0, queued.length)) fn()
    })
    .catch(() => {
      loading = false
    })
}

export function trackEvent(name: string, props?: Record<string, unknown>): void {
  if (client) {
    client.capture(name, props)
  } else if (loading && queued.length < 50) {
    queued.push(() => client?.capture(name, props))
  }
}

export function identifyUser(id: string, traits?: Record<string, unknown>): void {
  if (client) {
    client.identify(id, traits)
  } else if (loading && queued.length < 50) {
    queued.push(() => client?.identify(id, traits))
  }
}

export function analyticsReady(): boolean {
  return client !== null
}
