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

test('desktop does not apply the hosted process-memory limits that trim a world', () => {
  const env = buildLocalSimEnv(settings(), 4321, {})
  assert.equal(env.MEM_RSS_ELEVATED_MB, '0')
  assert.equal(env.MEM_RSS_CRITICAL_MB, '0')
  // host-wide floors are left to the server's defaults
  assert.equal(env.MEM_FLOOR_ELEVATED_MB, undefined)
  assert.equal(env.MEM_FLOOR_CRITICAL_MB, undefined)

  const tuned = buildLocalSimEnv(settings(), 4321, {
    MEM_RSS_ELEVATED_MB: '2048',
    MEM_RSS_CRITICAL_MB: '4096',
  })
  assert.equal(tuned.MEM_RSS_ELEVATED_MB, '2048')
  assert.equal(tuned.MEM_RSS_CRITICAL_MB, '4096')
})
