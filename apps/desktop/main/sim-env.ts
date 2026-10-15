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

  // The server's default RSS watchdog (320/480 MB) is tuned for a small hosted
  // box. Past those, memory pressure permanently trims a world: dead
  // organisms, life logs, the chronicle and extinct tribes' names are deleted
  // and the trimmed state is saved. A player's machine has far more memory
  // (the cap alone allows 5000 people), so disable the per-process limits here
  // (0 = off). The host-wide available-memory floors stay as the OOM guard.
  // An explicit value in the environment still wins.
  env.MEM_RSS_ELEVATED_MB ??= '0'
  env.MEM_RSS_CRITICAL_MB ??= '0'

  return env
}
