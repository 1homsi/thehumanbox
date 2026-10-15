import * as os from 'node:os'

import type { Settings } from './settings'

/**
 * Build the environment used by the downloadable game's bundled simulation:
 * loopback only, no monthly rollover, and the player's own speed and cap.
 */
export function rssLimitsMb(totalMemoryBytes: number): {
  elevatedMb: number
  criticalMb: number
} {
  const totalMb = Math.floor(totalMemoryBytes / (1024 * 1024))
  return {
    elevatedMb: Math.max(3072, Math.floor(totalMb * 0.35)),
    criticalMb: Math.max(4096, Math.floor(totalMb * 0.5)),
  }
}

export function buildLocalSimEnv(
  settings: Settings,
  port: number,
  inherited: NodeJS.ProcessEnv = process.env,
  totalMemoryBytes: number = os.totalmem(),
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
  // (the cap alone allows 5000 people), so scale the per-process limits to the
  // machine instead. On macOS the RSS limit is the only memory guard the
  // server has, so it stays as a real backstop rather than being switched off.
  // Explicit values in the environment still win.
  const { elevatedMb, criticalMb } = rssLimitsMb(totalMemoryBytes)
  env.MEM_RSS_ELEVATED_MB ??= String(elevatedMb)
  env.MEM_RSS_CRITICAL_MB ??= String(criticalMb)

  return env
}
