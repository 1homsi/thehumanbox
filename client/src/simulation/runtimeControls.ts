import type { TimeControl } from './sandbox'

export type RuntimeControl = 'pause' | 'resume' | 'speed'

export const WASM_BASE_TICK_MS = 120
export const MIN_WASM_TICK_MS = 16
export const MIN_RUNTIME_SPEED = 0.25
export const MAX_RUNTIME_SPEED = 50

export interface WasmSpeedConfig {
  tickMs: number
  stepsPerEmit: number
  speed: number
}

/**
 * Keep fast worlds simulation-accurate by batching ticks instead of relying
 * on sub-frame timers. The candidate search prefers the closest achievable
 * rate while keeping the timer above the browser's practical floor.
 */
export function wasmSpeedConfig(
  multiplier: number,
  baseTickMs = WASM_BASE_TICK_MS,
  minTickMs = MIN_WASM_TICK_MS,
): WasmSpeedConfig | null {
  if (
    !Number.isFinite(multiplier) ||
    multiplier < MIN_RUNTIME_SPEED ||
    multiplier > MAX_RUNTIME_SPEED ||
    !Number.isFinite(baseTickMs) ||
    baseTickMs <= 0 ||
    !Number.isFinite(minTickMs) ||
    minTickMs <= 0
  ) {
    return null
  }

  const minimumSteps = Math.max(1, Math.ceil((multiplier * minTickMs) / baseTickMs))
  const maxSteps = Math.min(256, Math.max(minimumSteps + 8, minimumSteps * 4))
  let best: WasmSpeedConfig | null = null
  let bestError = Number.POSITIVE_INFINITY

  for (let steps = 1; steps <= maxSteps; steps += 1) {
    const tickMs = Math.max(minTickMs, Math.round((baseTickMs * steps) / multiplier))
    const speed = (baseTickMs * steps) / tickMs
    const error = Math.abs(speed - multiplier)
    if (error < bestError || (error === bestError && (best === null || steps < best.stepsPerEmit))) {
      best = { tickMs, stepsPerEmit: steps, speed }
      bestError = error
    }
  }

  return best
}

export interface RuntimeState {
  paused: boolean
  speed: number
}

export interface RuntimeControlResult {
  ok: boolean
  paused?: boolean
  speed?: number
}

const RUNTIME_REQUEST_TIMEOUT_MS = 5_000

/**
 * Runtime status and control requests share one serialized UI queue. Bound
 * every request so an unresponsive desktop backend cannot permanently block
 * pause, resume, and speed controls behind a hydration request.
 */
export async function fetchRuntimeControlState(
  url: string,
  init: RequestInit = {},
  timeoutMs = RUNTIME_REQUEST_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
): Promise<RuntimeControlResult> {
  const controller = new AbortController()
  const callerSignal = init.signal
  const abortFromCaller = () => controller.abort()
  if (callerSignal?.aborted) controller.abort()
  else callerSignal?.addEventListener('abort', abortFromCaller, { once: true })
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal })
    const body: unknown = await response.json().catch(() => null)
    return parseRuntimeControlResult(response.ok, body)
  } catch {
    return { ok: false }
  } finally {
    clearTimeout(timer)
    callerSignal?.removeEventListener('abort', abortFromCaller)
  }
}

export function reconcileRuntimeState(current: RuntimeState, result: RuntimeControlResult): RuntimeState {
  if (!result.ok) return current
  return {
    paused: typeof result.paused === 'boolean' ? result.paused : current.paused,
    speed: typeof result.speed === 'number' ? result.speed : current.speed,
  }
}

export function isRuntimeControlActive(
  time: TimeControl | undefined,
  paused: boolean,
  speed: number,
): boolean {
  if (!time) return false
  if (time.control === 'pause') return paused
  if (time.control === 'resume') return !paused
  return typeof time.mult === 'number' && Math.abs(time.mult - speed) < 0.001
}

export function parseRuntimeControlResult(httpOk: boolean, body: unknown): RuntimeControlResult {
  if (!httpOk || typeof body !== 'object' || body === null) return { ok: false }
  const result = body as { ok?: unknown; paused?: unknown; speed?: unknown }
  if (result.ok !== true) return { ok: false }
  return {
    ok: true,
    paused: typeof result.paused === 'boolean' ? result.paused : undefined,
    speed:
      typeof result.speed === 'number' && Number.isFinite(result.speed) && result.speed > 0
        ? result.speed
        : undefined,
  }
}

export function nextRuntimeState(
  current: RuntimeState,
  control: RuntimeControl,
  mult: number | undefined,
  result: RuntimeControlResult,
): RuntimeState {
  if (!result.ok) return current
  const paused =
    typeof result.paused === 'boolean'
      ? result.paused
      : control === 'pause'
        ? true
        : control === 'resume'
          ? false
          : current.paused
  const speed =
    typeof result.speed === 'number'
      ? result.speed
      : control === 'speed' && typeof mult === 'number' && Number.isFinite(mult) && mult > 0
        ? mult
        : current.speed
  return reconcileRuntimeState(current, { ok: true, paused, speed })
}
