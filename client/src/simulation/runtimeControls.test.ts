import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchRuntimeControlState,
  nextRuntimeState,
  parseRuntimeControlResult,
  reconcileRuntimeState,
  wasmSpeedConfig,
} from './runtimeControls'

afterEach(() => {
  vi.useRealTimers()
})

describe('fetchRuntimeControlState', () => {
  it('parses an acknowledged runtime response', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, paused: true, speed: 2 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ) as unknown as typeof fetch

    await expect(fetchRuntimeControlState('/runtime', {}, 100, fetchImpl)).resolves.toEqual({
      ok: true,
      paused: true,
      speed: 2,
    })
  })

  it('aborts a hung runtime request instead of blocking later controls forever', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'))
          })
        }),
    ) as unknown as typeof fetch

    const result = fetchRuntimeControlState('/runtime', {}, 50, fetchImpl)
    await vi.advanceTimersByTimeAsync(50)

    await expect(result).resolves.toEqual({ ok: false })
  })
})

describe('parseRuntimeControlResult', () => {
  it('requires both a successful response and an affirmative backend result', () => {
    expect(parseRuntimeControlResult(true, { ok: true, paused: true, speed: 6.25 })).toEqual({
      ok: true,
      paused: true,
      speed: 6.25,
    })
    expect(parseRuntimeControlResult(true, { ok: false })).toEqual({ ok: false })
    expect(parseRuntimeControlResult(false, { ok: true })).toEqual({ ok: false })
    expect(parseRuntimeControlResult(true, null)).toEqual({ ok: false })
  })
})

describe('wasmSpeedConfig', () => {
  it('keeps the requested high-speed presets simulation-accurate', () => {
    expect([2, 4, 10, 50].map((multiplier) => wasmSpeedConfig(multiplier))).toEqual([
      { tickMs: 60, stepsPerEmit: 1, speed: 2 },
      { tickMs: 30, stepsPerEmit: 1, speed: 4 },
      { tickMs: 24, stepsPerEmit: 2, speed: 10 },
      { tickMs: 24, stepsPerEmit: 10, speed: 50 },
    ])
  })

  it('rejects speeds outside the supported runtime range', () => {
    expect(wasmSpeedConfig(0.1)).toBeNull()
    expect(wasmSpeedConfig(51)).toBeNull()
  })
})

describe('reconcileRuntimeState', () => {
  it('hydrates the renderer from the runtime truth after a reload', () => {
    expect(reconcileRuntimeState({ paused: false, speed: 1 }, { ok: true, paused: true, speed: 3 })).toEqual({
      paused: true,
      speed: 3,
    })
  })

  it('keeps known state when a status request fails', () => {
    const current = { paused: true, speed: 3 }
    expect(reconcileRuntimeState(current, { ok: false })).toBe(current)
  })
})

describe('nextRuntimeState', () => {
  it('retains the last truthful state when a command fails', () => {
    const current = { paused: true, speed: 3 }
    expect(nextRuntimeState(current, 'resume', undefined, { ok: false })).toBe(current)
  })

  it('updates pause independently from speed', () => {
    expect(
      nextRuntimeState({ paused: false, speed: 3 }, 'pause', undefined, {
        ok: true,
        paused: true,
      }),
    ).toEqual({ paused: true, speed: 3 })
  })

  it('updates speed while preserving the backend pause state', () => {
    expect(
      nextRuntimeState({ paused: false, speed: 1 }, 'speed', 0.5, {
        ok: true,
        paused: true,
      }),
    ).toEqual({ paused: true, speed: 0.5 })
  })

  it('prefers the speed acknowledged by a clamping runtime', () => {
    expect(
      nextRuntimeState({ paused: false, speed: 1 }, 'speed', 8, { ok: true, paused: false, speed: 6.25 }),
    ).toEqual({ paused: false, speed: 6.25 })
  })
})
