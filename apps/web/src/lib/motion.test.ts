// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { motionTime, prefersReducedMotion, resetMotionForTests } from './motion'

function mockMedia(matches: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = []
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.push(fn),
  }) as never
  return listeners
}

describe('reduced motion', () => {
  afterEach(() => resetMotionForTests())

  it('keeps real time when motion is welcome', () => {
    mockMedia(false)
    expect(prefersReducedMotion()).toBe(false)
    expect(motionTime(1234)).toBe(1234)
  })

  it('freezes decorative animation for players who asked for less motion', () => {
    mockMedia(true)
    expect(prefersReducedMotion()).toBe(true)
    expect(motionTime(1234)).toBe(0)
  })

  it('follows a change of setting while the game runs', () => {
    const listeners = mockMedia(false)
    expect(motionTime(50)).toBe(50)
    listeners.forEach((fn) => fn({ matches: true }))
    expect(motionTime(50)).toBe(0)
  })
})
