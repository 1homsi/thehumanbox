import { describe, expect, it } from 'vitest'
import { resolveWorldSource, shouldShowIdleResume, shouldUseSimulationApi } from './worldSource'

describe('resolveWorldSource', () => {
  it('starts the standalone web app in a private local world', () => {
    expect(resolveWorldSource(null, false)).toBe('wasm')
  })

  it('lets the desktop renderer use its native simulation mode', () => {
    expect(resolveWorldSource(null, true)).toBe('remote')
  })

  it('preserves an explicit player choice', () => {
    expect(resolveWorldSource('remote', false)).toBe('remote')
    expect(resolveWorldSource('wasm', true)).toBe('wasm')
  })
})

describe('shouldShowIdleResume', () => {
  it('never interrupts a local game for inactivity', () => {
    expect(shouldShowIdleResume(true, true)).toBe(false)
  })

  it('still lets the hosted world park idle connections', () => {
    expect(shouldShowIdleResume(true, false)).toBe(true)
  })
})

describe('shouldUseSimulationApi', () => {
  it('keeps a standalone local web world disconnected from the simulation API', () => {
    expect(shouldUseSimulationApi('wasm')).toBe(false)
  })

  it('uses the API for an explicitly selected shared web world', () => {
    expect(shouldUseSimulationApi('remote')).toBe(true)
  })

  it('allows desktop to reach its native simulation', () => {
    expect(shouldUseSimulationApi('remote')).toBe(true)
  })

  it('keeps an explicitly selected desktop WASM world on its own data source', () => {
    expect(shouldUseSimulationApi('wasm')).toBe(false)
  })
})
