// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

const originalMatchMedia = window.matchMedia

/** Evaluates media queries against a device the way a browser would (mirrors phone.test.ts). */
function stubDevice(d: { width: number; height: number; coarse: boolean; hoverNone: boolean }) {
  const has = (clause: string) => {
    const w = /max-width: (\d+)px/.exec(clause)
    if (w) return d.width <= Number(w[1])
    const h = /max-height: (\d+)px/.exec(clause)
    if (h) return d.height <= Number(h[1])
    if (clause.includes('pointer: coarse')) return d.coarse
    if (clause.includes('hover: none')) return d.hoverNone
    throw new Error(`unhandled clause ${clause}`)
  }
  window.matchMedia = ((q: string) => ({
    matches: q.split(',').some((alt) => alt.split(' and ').every((c) => has(c))),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
}

async function lowPerf() {
  vi.resetModules()
  return (await import('./perf')).LOW_PERF
}

afterEach(() => {
  window.matchMedia = originalMatchMedia
  vi.unstubAllGlobals()
})

describe('LOW_PERF', () => {
  it('is on for a narrow phone viewport', async () => {
    stubDevice({ width: 390, height: 844, coarse: true, hoverNone: true })
    expect(await lowPerf()).toBe(true)
  })

  it('is on for a touch-first device wider than a phone (landscape phone, tablet)', async () => {
    stubDevice({ width: 1024, height: 768, coarse: true, hoverNone: true })
    expect(await lowPerf()).toBe(true)
  })

  it('stays off for a wide mouse-driven window on a capable machine', async () => {
    stubDevice({ width: 1280, height: 800, coarse: false, hoverNone: false })
    vi.stubGlobal('navigator', { hardwareConcurrency: 8 })
    expect(await lowPerf()).toBe(false)
  })
})
