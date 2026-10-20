import { describe, expect, it } from 'vitest'
import { isDesktopStartupPending } from './desktopStartup'

describe('isDesktopStartupPending', () => {
  it('holds the splash for a desktop renderer without a simulation API', () => {
    expect(isDesktopStartupPending(true, '?desktop=1')).toBe(true)
  })

  it('releases the startup hold once the simulation API is provided', () => {
    expect(isDesktopStartupPending(true, '?desktop=1&api=127.0.0.1%3A8000')).toBe(false)
  })

  it('keeps the hold when the API query is empty', () => {
    expect(isDesktopStartupPending(true, '?desktop=1&api=')).toBe(true)
  })

  it('does not change browser startup', () => {
    expect(isDesktopStartupPending(false, '')).toBe(false)
  })
})
