import type { Settings } from './settings'

const LLM_ENV_KEYS = [
  'LLM_URL',
  'LLM_KEY',
  'LLM_MODEL',
  'GROQ_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'NARRATION_LLM_URL',
  'NARRATION_LLM_KEY',
  'NARRATION_LLM_MODEL',
  'THINK_LLM_URL',
  'THINK_LLM_KEY',
  'THINK_LLM_MODEL',
] as const

/**
 * Build the deliberately isolated environment used by the downloadable game.
 * In particular, choosing "none" must not let shell-level API credentials or
 * endpoints leak into the bundled simulation process.
 */
export function buildLocalSimEnv(
  settings: Settings,
  port: number,
  inherited: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...inherited,
    TICK_MS: String(settings.tickMs),
    MAX_POPULATION: String(settings.populationCap),
    PORT: String(port),
    BIND_HOST: '127.0.0.1',
    THB_PROFILE: 'local',
    THB_MONTHLY_ROLLOVER: '0',
    THB_EXTRA_CORS_ORIGINS: 'null',
    THB_SANDBOX: '1',
  }

  if (settings.model.provider === 'none') {
    for (const key of LLM_ENV_KEYS) env[key] = ''
    env.THB_LLM_DISABLED = '1'
  } else {
    env.THB_LLM_DISABLED = '0'
    env.NARRATION_LLM_URL = settings.model.apiUrl
    env.NARRATION_LLM_KEY = settings.model.apiKey
    env.NARRATION_LLM_MODEL = settings.model.modelName
    env.THINK_LLM_URL = settings.model.apiUrl
    env.THINK_LLM_KEY = settings.model.apiKey
    env.THINK_LLM_MODEL = settings.model.modelName
  }

  return env
}
