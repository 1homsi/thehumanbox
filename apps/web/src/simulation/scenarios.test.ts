import { describe, expect, it } from 'vitest'
import { SANDBOX_CATEGORIES } from './sandbox'
import { SCENARIO_PRESETS } from './scenarios'

describe('scenario presets', () => {
  it('has distinct, named presets', () => {
    const ids = SCENARIO_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of SCENARIO_PRESETS) {
      expect(p.title.length).toBeGreaterThan(0)
      expect(p.detail.length).toBeGreaterThan(0)
    }
  })

  it('places every step inside the map, for small and large worlds', () => {
    for (const [w, h] of [
      [40, 24],
      [400, 300],
    ]) {
      for (const preset of SCENARIO_PRESETS) {
        for (const step of preset.steps(w, h)) {
          if ('x' in step) {
            expect(step.x).toBeGreaterThanOrEqual(0)
            expect(step.x).toBeLessThan(w)
            expect(step.y).toBeGreaterThanOrEqual(0)
            expect(step.y).toBeLessThan(h)
          }
        }
      }
    }
  })

  it('uses only commands and animal kinds the sandbox already offers', () => {
    const known = new Set(
      SANDBOX_CATEGORIES.flatMap((c) => c.tools)
        .map((t) => t.build?.(0, 0, 1) ?? t.fire)
        .filter(Boolean)
        .map((c) => (c as { cmd: string }).cmd),
    )
    for (const preset of SCENARIO_PRESETS) {
      for (const step of preset.steps(100, 60)) {
        expect(known.has(step.cmd) || step.cmd === 'weather' || step.cmd === 'make_leader').toBe(true)
      }
    }
  })
})
