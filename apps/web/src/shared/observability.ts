import type posthogType from 'posthog-js'
import { getWorldSource } from '../simulation/worldSource'
import { getLocale } from '../i18n'
import { isPhoneViewport } from './phone'
import { readLowPerf } from './perf-mode'

declare const __APP_VERSION__: string | undefined

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com'
const BUILD_SHA = import.meta.env.VITE_GIT_SHA as string | undefined

/** How often the session clock ticks, and how long after the last input a player still counts as active. */
const CLOCK_MS = 15_000
const ACTIVE_WINDOW_MS = 120_000

let client: typeof posthogType | null = null
let loading = false
const queued: Array<() => void> = []

/** Facts about the world at the moment a session summary is sent; App supplies them. */
export type WorldSummary = Record<string, string | number | boolean | null>
let worldSummary: (() => WorldSummary | null) | null = null

/** What happened since the last summary. Reset after every send, so summaries add up. */
interface Segment {
  visibleMs: number
  activeMs: number
  events: Record<string, number>
  toolsApplied: Record<string, number>
  startTick: number | null
}
let segment: Segment = newSegment()
let lastInputAt = 0
/** When the page last became visible (or was last accounted), null while hidden. */
let visibleSince: number | null = null

function newSegment(): Segment {
  return { visibleMs: 0, activeMs: 0, events: {}, toolsApplied: {}, startTick: null }
}

/** Tagged on every event, so any chart can be split by these. */
function contextProps(): Record<string, unknown> {
  const desk = typeof window === 'undefined' ? undefined : window.thbDesktop
  return {
    surface: desk ? 'desktop' : 'web',
    app_version: desk?.appVersion ?? (typeof __APP_VERSION__ === 'undefined' ? null : __APP_VERSION__),
    build_sha: BUILD_SHA ?? null,
    desktop_platform: desk?.platform ?? null,
    world_source: getWorldSource(),
    locale: getLocale(),
    phone: isPhoneViewport(),
    low_perf: readLowPerf(),
    viewport_w: window.innerWidth,
    viewport_h: window.innerHeight,
    pixel_ratio: window.devicePixelRatio,
  }
}

export function initAnalytics(): void {
  if (client || loading) return
  if (!KEY) return
  if (typeof window === 'undefined') return
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
        // Clicks on controls only; the world canvas and free text stay out.
        autocapture: {
          dom_event_allowlist: ['click'],
          element_allowlist: ['a', 'button', 'select', 'label'],
        },
        capture_exceptions: true,
        capture_performance: false,
        disable_session_recording: true,
      })
      posthog.register(contextProps())
      client = posthog
      let resizeTimer: number | undefined
      window.addEventListener('resize', () => {
        window.clearTimeout(resizeTimer)
        resizeTimer = window.setTimeout(() => client?.register(contextProps()), 1000)
      })
      startSessionClock()
      for (const fn of queued.splice(0, queued.length)) fn()
    })
    .catch(() => {
      loading = false
    })
}

/** Refresh the per-event context, e.g. once the interface language has loaded. */
export function refreshAnalyticsContext(): void {
  whenReady(() => client?.register(contextProps()))
}

/** `send_instantly` skips batching, for events followed straight away by a reload. */
export function trackEvent(
  name: string,
  props?: Record<string, unknown>,
  options?: { send_instantly?: boolean },
): void {
  if (!client && !loading) return
  segment.events[name] = (segment.events[name] ?? 0) + 1
  whenReady(() => client?.capture(name, props, options))
}

/** Count a tool used on the world. Brushes fire many times per stroke, so these only go out in the summary. */
export function countToolApply(toolId: string): void {
  if (!client && !loading) return
  segment.toolsApplied[toolId] = (segment.toolsApplied[toolId] ?? 0) + 1
}

export function setWorldSummary(fn: (() => WorldSummary | null) | null): void {
  worldSummary = fn
}

function whenReady(fn: () => void): void {
  if (client) fn()
  else if (loading && queued.length < 50) queued.push(fn)
}

function startSessionClock(): void {
  lastInputAt = Date.now()
  const markInput = () => {
    lastInputAt = Date.now()
  }
  for (const type of ['pointerdown', 'keydown', 'wheel'] as const) {
    window.addEventListener(type, markInput, { passive: true, capture: true })
  }
  if (document.visibilityState === 'visible') beginVisible()
  window.setInterval(accrueVisible, CLOCK_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      beginVisible()
    } else {
      accrueVisible()
      visibleSince = null
      sendSummary()
    }
  })
  window.addEventListener('pagehide', () => {
    accrueVisible()
    visibleSince = null
    sendSummary()
  })
}

function beginVisible(): void {
  visibleSince = Date.now()
  if (segment.startTick === null) segment.startTick = worldTick(readWorld())
}

/** Add the visible time since the last account; it counts as active while input is recent. */
function accrueVisible(): void {
  if (visibleSince === null) return
  const now = Date.now()
  const elapsed = now - visibleSince
  visibleSince = now
  segment.visibleMs += elapsed
  if (now - lastInputAt < ACTIVE_WINDOW_MS) segment.activeMs += elapsed
  if (segment.startTick === null) segment.startTick = worldTick(readWorld())
}

function readWorld(): WorldSummary | null {
  try {
    return worldSummary?.() ?? null
  } catch {
    return null
  }
}

function worldTick(world: WorldSummary | null): number | null {
  return typeof world?.tick === 'number' ? world.tick : null
}

/** One event per stretch of play, sent when the page is hidden or closed. */
function sendSummary(): void {
  if (!client) return
  const toolsTotal = Object.values(segment.toolsApplied).reduce((a, b) => a + b, 0)
  if (segment.visibleMs === 0 && toolsTotal === 0 && Object.keys(segment.events).length === 0) return
  const world = readWorld()
  const tick = worldTick(world)
  const done = segment
  segment = newSegment()
  client.capture(
    'session_summary',
    {
      visible_seconds: done.visibleMs / 1000,
      active_seconds: done.activeMs / 1000,
      ticks_watched: tick !== null && done.startTick !== null ? Math.max(0, tick - done.startTick) : null,
      event_counts: done.events,
      tools_applied: done.toolsApplied,
      tools_applied_total: toolsTotal,
      ...world,
    },
    // Unbatched, so it leaves before the page does instead of waiting in the batch queue.
    { send_instantly: true, transport: 'sendBeacon' },
  )
}
