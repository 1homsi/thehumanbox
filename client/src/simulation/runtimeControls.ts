import type { TimeControl } from './sandbox'

export type RuntimeControl = 'pause' | 'resume' | 'speed'

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
