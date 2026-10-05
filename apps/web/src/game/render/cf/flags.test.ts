import { afterEach, describe, expect, it, vi } from 'vitest'
import { cfFlag, cfFlags, resetCfFlagsForTests } from './flags'

function env(search: string, stored: string | null = null) {
  vi.stubGlobal('location', { search })
  vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'thb-cf' ? stored : null) })
  resetCfFlagsForTests()
}

afterEach(() => {
  vi.unstubAllGlobals()
  resetCfFlagsForTests()
})

describe('cubeforge migration flags', () => {
  it('are all off by default, so the canvas painters stay the default', () => {
    env('')
    expect(cfFlags().size).toBe(0)
    expect(cfFlag('overlays')).toBe(false)
  })

  it('read a comma list from ?cf=', () => {
    env('?cf=overlays,effects')
    expect(cfFlag('overlays')).toBe(true)
    expect(cfFlag('effects')).toBe(true)
    expect(cfFlag('hud')).toBe(false)
  })

  it('ignore case and spaces, and let `all` switch everything on', () => {
    env('?cf=%20Overlays%20,HUD')
    expect(cfFlag('overlays')).toBe(true)
    expect(cfFlag('hud')).toBe(true)
    env('?cf=all')
    expect(cfFlag('atmosphere')).toBe(true)
    expect(cfFlag('anything-else')).toBe(true)
  })

  it('fall back to local storage when the URL has no cf param, and the URL wins when it has', () => {
    env('', 'terrain')
    expect(cfFlag('terrain')).toBe(true)
    expect(cfFlag('overlays')).toBe(false)
    env('?cf=overlays', 'terrain')
    expect(cfFlag('overlays')).toBe(true)
    expect(cfFlag('terrain')).toBe(false)
  })

  it('do not throw when storage or location are unavailable', () => {
    vi.stubGlobal('location', undefined)
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
    })
    resetCfFlagsForTests()
    expect(cfFlag('overlays')).toBe(false)
  })
})
