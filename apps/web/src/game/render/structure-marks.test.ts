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

  it('draws a house for dense land, a hut for medium land and a mound for sparse land', () => {
    const calls = (s: number) => {
      const r = recorder()
      paintStructureTile(r.ctx, 0, 0, s)
      return r.log
    }
    // Dense and medium have a roof (a filled triangle); sparse is one flat rectangle.
    expect(calls(0.9).filter((c) => c.startsWith('lineTo'))).toHaveLength(2)
    expect(calls(0.5).filter((c) => c.startsWith('lineTo'))).toHaveLength(2)
    expect(calls(0.1).filter((c) => c.startsWith('lineTo'))).toHaveLength(0)
    expect(calls(0.1).filter((c) => c.startsWith('fillRect'))).toHaveLength(1)
    expect(calls(0.9).filter((c) => c.startsWith('fillRect')).length).toBeGreaterThan(
      calls(0.5).filter((c) => c.startsWith('fillRect')).length,
    )
  })

  it('paints the same pixels for the same key', () => {
    const a = recorder()
    const b = recorder()
    paintStructureTile(a.ctx, 0, 0, 0.8)
    paintStructureTile(b.ctx, 0, 0, 0.8004)
    expect(a.log).toEqual(b.log)
  })
})
