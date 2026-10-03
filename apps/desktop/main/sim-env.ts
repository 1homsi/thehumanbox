import type { Settings } from './settings'

/**
 * Build the environment used by the downloadable game's bundled simulation:
 * loopback only, no monthly rollover, and the player's own speed and cap.
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

  return env
}
