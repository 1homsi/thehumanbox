import assert from 'node:assert/strict'
import test from 'node:test'

import { buildLocalSimEnv } from './sim-env'
import type { Settings } from './settings'

function settings(overrides: Partial<Settings> = {}): Settings {
  const defaults: Settings = {
    mode: 'local',
    tickMs: 100,
    populationCap: 1000,
    saveLocationOverride: null,
    autoUpdate: true,
    autoLaunch: false,
    startMinimized: false,
    pauseWhenHidden: true,
  }
  return { ...defaults, ...overrides }
}

test('local simulation profile disables rollover and forwards its population cap', () => {
  const env = buildLocalSimEnv(settings({ populationCap: 777 }), 4321, {})

  assert.equal(env.THB_PROFILE, 'local')
  assert.equal(env.THB_MONTHLY_ROLLOVER, '0')
  assert.equal(env.MAX_POPULATION, '777')
  assert.equal(env.BIND_HOST, '127.0.0.1')
  assert.equal(env.PORT, '4321')
})
