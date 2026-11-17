import { describe, expect, it } from 'vitest'
import { paintStructureTile, structureCellKey, structureStrength } from './structure-marks'

function recorder() {
  const log: string[] = []
  const state: Record<string, unknown> = {}
  const ctx = new Proxy(state, {
    get: (t, key: string) =>
      key in t ? t[key] : (...args: unknown[]) => log.push(`${key}(${args.map(String).join(',')})`),
    set: (t, key: string, value) => ((t[key] = value), log.push(`${key}=${String(value)}`), true),
  }) as unknown as CanvasRenderingContext2D
  return { ctx, log }
}

describe('settlement structure marks', () => {
  it('has one look per whole percent', () => {
    expect(structureCellKey(0.5)).toBe(structureCellKey(0.5004))
    expect(structureCellKey(0.5)).not.toBe(structureCellKey(0.51))
    expect(structureStrength(0.6049)).toBe(0.6)
  })

  it('wears the ground more the denser the land: a scuff, a worn patch, a packed yard', () => {
    const pixels = (s: number) => {
      const r = recorder()
      paintStructureTile(r.ctx, 0, 0, s)
      return r.log.filter((c) => c.startsWith('fillRect'))
    }
    expect(pixels(0.1).length).toBeGreaterThan(0)
    expect(pixels(0.5).length).toBeGreaterThan(pixels(0.1).length)
    expect(pixels(0.9).length).toBeGreaterThan(pixels(0.5).length)
    // Whole pixels only: no paths, and every rectangle is one pixel.
    const r = recorder()
    paintStructureTile(r.ctx, 0, 0, 0.9)
    expect(r.log.some((c) => c.startsWith('lineTo') || c.startsWith('beginPath'))).toBe(false)
    expect(r.log.filter((c) => c.startsWith('fillRect')).every((c) => c.endsWith(',1,1)'))).toBe(true)
    // Solid palette colours, never a translucent wash.
    expect(
      r.log.filter((c) => c.startsWith('fillStyle=')).every((c) => /^fillStyle=#[0-9a-f]{6}$/.test(c)),
    ).toBe(true)
  })

  it('paints the same pixels for the same key', () => {
    const a = recorder()
    const b = recorder()
    paintStructureTile(a.ctx, 0, 0, 0.8)
    paintStructureTile(b.ctx, 0, 0, 0.8004)
    expect(a.log).toEqual(b.log)
  })
})
