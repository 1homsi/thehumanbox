// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

function mockMedia(matching: string[]) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({ matches: matching.includes(query), media: query }) as MediaQueryList,
  )
}

async function lowPerf() {
  vi.resetModules()
  return (await import('./perf')).LOW_PERF
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LOW_PERF', () => {
  it('is on for a narrow phone viewport', async () => {
    mockMedia(['(max-width: 767px)'])
    expect(await lowPerf()).toBe(true)
  })

  it('is on for a touch-first device wider than a phone (landscape phone, tablet)', async () => {
    mockMedia(['(pointer: coarse) and (hover: none)'])
    expect(await lowPerf()).toBe(true)
  })

  it('stays off for a wide mouse-driven window on a capable machine', async () => {
    mockMedia([])
    vi.stubGlobal('navigator', { hardwareConcurrency: 8 })
    expect(await lowPerf()).toBe(false)
  })
})
