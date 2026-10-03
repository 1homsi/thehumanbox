import { describe, expect, it } from 'vitest'
import {
  isDesktopWindowInactive,
  parsePauseWhenHiddenPreference,
  shouldPauseDesktopRenderer,
  syncRendererLoopPause,
  threeFrameLoopForPause,
} from './desktopVisibility'

describe('desktop visibility preferences', () => {
  it('recognizes minimized and tray-hidden windows as inactive', () => {
    expect(isDesktopWindowInactive('minimized')).toBe(true)
    expect(isDesktopWindowInactive('hidden')).toBe(true)
    expect(isDesktopWindowInactive('restored')).toBe(false)
    expect(isDesktopWindowInactive('unexpected')).toBe(false)
  })

  it('only pauses renderer work when the preference is enabled', () => {
    expect(shouldPauseDesktopRenderer(true, 'minimized')).toBe(true)
    expect(shouldPauseDesktopRenderer(true, 'hidden')).toBe(true)
    expect(shouldPauseDesktopRenderer(false, 'minimized')).toBe(false)
    expect(shouldPauseDesktopRenderer(true, 'restored')).toBe(false)
  })

  it('accepts only saved boolean preference values', () => {
    expect(parsePauseWhenHiddenPreference(false)).toBe(false)
    expect(parsePauseWhenHiddenPreference(true)).toBe(true)
    expect(parsePauseWhenHiddenPreference('false')).toBeNull()
  })

  it('stops and resumes an imperative renderer loop', () => {
    let pauses = 0
    let resumes = 0
    const controls = {
      pause: () => {
        pauses += 1
      },
      resume: () => {
        resumes += 1
      },
    }

    syncRendererLoopPause(controls, true)
    syncRendererLoopPause(controls, false)

    expect(pauses).toBe(1)
    expect(resumes).toBe(1)
  })

  it('fully disables and restores the React Three Fiber frame loop', () => {
    expect(threeFrameLoopForPause(true)).toBe('never')
    expect(threeFrameLoopForPause(false)).toBe('always')
  })
})
