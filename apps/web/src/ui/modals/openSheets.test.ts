import { afterEach, describe, expect, it } from 'vitest'
import {
  hasOpenSheet,
  registerOpenSheet,
  shouldPauseForPhoneSheet,
  subscribeToOpenSheets,
} from './openSheets'

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.()
})

describe('open phone sheets', () => {
  it('tracks mounted sheets until each one unregisters', () => {
    const changes: boolean[] = []
    const unsubscribe = subscribeToOpenSheets(() => changes.push(hasOpenSheet()))
    cleanups.push(unsubscribe)

    const first = registerOpenSheet()
    cleanups.push(first)
    expect(hasOpenSheet()).toBe(true)

    const second = registerOpenSheet()
    cleanups.push(second)
    first()
    expect(hasOpenSheet()).toBe(true)

    second()
    expect(hasOpenSheet()).toBe(false)
    expect(changes).toEqual([true, true, true, false])
  })

  it('ignores a second unregister for the same sheet', () => {
    const unregister = registerOpenSheet()
    expect(hasOpenSheet()).toBe(true)
    unregister()
    unregister()
    expect(hasOpenSheet()).toBe(false)
  })

  it('pauses only for an open sheet at the width breakpoint used by its CSS', () => {
    expect(shouldPauseForPhoneSheet(false, true)).toBe(false)
    expect(shouldPauseForPhoneSheet(true, false)).toBe(false)
    expect(shouldPauseForPhoneSheet(true, true)).toBe(true)
  })
})
