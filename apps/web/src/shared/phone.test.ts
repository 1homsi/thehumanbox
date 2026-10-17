import { afterEach, describe, expect, it, vi } from 'vitest'
import { PHONE_QUERY, isPhoneSheetWidth, isPhoneViewport } from './phone'

/** Evaluates PHONE_QUERY against a device the way a browser would. */
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
  vi.stubGlobal('window', {
    innerWidth: d.width,
    matchMedia: (q: string) => ({
      matches: q.split(',').some((alt) => alt.split(' and ').every((c) => has(c))),
    }),
  })
}

describe('phone viewport', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses one query for narrow and for short touch-only screens', () => {
    expect(PHONE_QUERY).toContain('max-width: 767px')
    expect(PHONE_QUERY).toContain('max-height: 500px')
  })

  it('counts a portrait phone', () => {
    stubDevice({ width: 390, height: 844, coarse: true, hoverNone: true })
    expect(isPhoneViewport()).toBe(true)
  })

  it('counts a phone held sideways', () => {
    stubDevice({ width: 844, height: 390, coarse: true, hoverNone: true })
    expect(isPhoneViewport()).toBe(true)
  })

  it('does not count a tablet in either orientation', () => {
    stubDevice({ width: 768, height: 1024, coarse: true, hoverNone: true })
    expect(isPhoneViewport()).toBe(false)
    stubDevice({ width: 1024, height: 768, coarse: true, hoverNone: true })
    expect(isPhoneViewport()).toBe(false)
  })

  it('does not count a short desktop window with a mouse', () => {
    stubDevice({ width: 1200, height: 420, coarse: false, hoverNone: false })
    expect(isPhoneViewport()).toBe(false)
  })

  it('is false without a window', () => {
    expect(isPhoneViewport()).toBe(false)
  })
})

describe('phone sheet breakpoint', () => {
  it('matches the modal CSS width boundary', () => {
    expect(isPhoneSheetWidth(767)).toBe(true)
    expect(isPhoneSheetWidth(768)).toBe(false)
    expect(isPhoneSheetWidth(844)).toBe(false)
    expect(isPhoneSheetWidth(740)).toBe(true)
  })
})
