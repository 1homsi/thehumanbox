import assert from 'node:assert/strict'
import test from 'node:test'

import { buildLocalSimEnv } from './sim-env'
import type { Settings } from './settings'

function settings(overrides: Partial<Settings> = {}): Settings {
  const defaults: Settings = {
    mode: 'local',
    remoteUrl: 'https://api.thehumanbox.com',
    tickMs: 100,
    populationCap: 1000,
    model: { provider: 'none', apiUrl: '', apiKey: '', modelName: '' },
    saveLocationOverride: null,
    autoUpdate: true,
    autoLaunch: false,
    startMinimized: false,
    pauseWhenHidden: true,
  }
  return {
    ...defaults,
    ...overrides,
    model: {
      ...defaults.model,
      ...overrides.model,
    },
  }
}

test('local simulation profile disables rollover and forwards its population cap', () => {
  const env = buildLocalSimEnv(settings({ populationCap: 777 }), 4321, {})

  assert.equal(env.THB_PROFILE, 'local')
  assert.equal(env.THB_MONTHLY_ROLLOVER, '0')
  assert.equal(env.MAX_POPULATION, '777')
  assert.equal(env.BIND_HOST, '127.0.0.1')
  assert.equal(env.PORT, '4321')
})

test('provider none clears inherited LLM configuration and disables all workers', () => {
  const env = buildLocalSimEnv(settings(), 4321, {
    LLM_URL: 'https://inherited.example/v1',
    LLM_KEY: 'inherited-key',
    GROQ_API_KEY: 'inherited-groq-key',
    NARRATION_LLM_URL: 'https://narration.example/v1',
    THINK_LLM_KEY: 'inherited-think-key',
  })

  assert.equal(env.THB_LLM_DISABLED, '1')
  assert.equal(env.LLM_URL, '')
  assert.equal(env.LLM_KEY, '')
  assert.equal(env.GROQ_API_KEY, '')
  assert.equal(env.NARRATION_LLM_URL, '')
  assert.equal(env.THINK_LLM_KEY, '')
})

test('an explicitly selected provider replaces inherited lane configuration', () => {
  const env = buildLocalSimEnv(
    settings({
      model: {
        provider: 'ollama',
        apiUrl: 'http://127.0.0.1:11434/v1/chat/completions',
        apiKey: '',
        modelName: 'gemma3',
      },
    }),
    4321,
    {
      THB_LLM_DISABLED: '1',
      NARRATION_LLM_URL: 'https://inherited.example/v1',
    },
  )

  assert.equal(env.THB_LLM_DISABLED, '0')
  assert.equal(env.NARRATION_LLM_URL, 'http://127.0.0.1:11434/v1/chat/completions')
  assert.equal(env.THINK_LLM_URL, 'http://127.0.0.1:11434/v1/chat/completions')
  assert.equal(env.NARRATION_LLM_MODEL, 'gemma3')
})
