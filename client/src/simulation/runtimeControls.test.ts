import { describe, expect, it } from 'vitest'
import { nextRuntimeState, parseRuntimeControlResult, reconcileRuntimeState } from './runtimeControls'

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
