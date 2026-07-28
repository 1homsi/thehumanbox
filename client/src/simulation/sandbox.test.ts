import { describe, expect, it } from 'vitest'
import { SANDBOX_CATEGORIES, canSendSandboxCommand, isSandboxViewControlActive } from './sandbox'

describe('sandbox command permission', () => {
  it('allows commands for a browser-owned world', () => {
    expect(canSendSandboxCommand('wasm', false, false)).toBe(true)
  })

  it('allows commands for a desktop app connected to its local simulation', () => {
    expect(canSendSandboxCommand('native', true, true)).toBe(true)
  })

  it('rejects commands for the shared remote world in every renderer', () => {
    expect(canSendSandboxCommand('native', false, false)).toBe(false)
    expect(canSendSandboxCommand('native', true, false)).toBe(false)
  })
})

describe('sandbox map controls', () => {
  it('keeps civilization views in the primary bottom dock', () => {
    const maps = SANDBOX_CATEGORIES.find((category) => category.id === 'maps')
    expect(maps?.tools.map((tool) => tool.id)).toEqual([
      'territory_map',
      'settlement_map',
      'population_map',
      'hazard_map',
      'routes_map',
      'migration_map',
    ])
  })

  it('marks only the selected data overlay active', () => {
    const population = { control: 'overlay' as const, value: 'density' as const }
    expect(isSandboxViewControlActive(population, 'density', {})).toBe(true)
    expect(isSandboxViewControlActive(population, 'hazard', {})).toBe(false)
    expect(isSandboxViewControlActive(population, null, {})).toBe(false)
  })

  it('reads map flags independently from overlays', () => {
    const borders = { control: 'flag' as const, value: 'territory' as const }
    expect(isSandboxViewControlActive(borders, null, { territory: true })).toBe(true)
    expect(isSandboxViewControlActive(borders, 'density', { territory: false })).toBe(false)
  })
})
