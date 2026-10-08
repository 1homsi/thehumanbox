import type { SandboxCommand } from './sandbox'

export interface ScenarioPreset {
  id: string
  title: string
  detail: string
  /** The commands to send, placed by fractions of the world's width and height. */
  steps: (width: number, height: number) => SandboxCommand[]
}

/** A point at the given fraction of the world, kept inside the map. */
function at(width: number, height: number, fx: number, fy: number): { x: number; y: number } {
  return {
    x: Math.min(width - 1, Math.max(0, Math.floor(width * fx))),
    y: Math.min(height - 1, Math.max(0, Math.floor(height * fy))),
  }
}

/**
 * Scenarios are short, ready-made additions to the world you are watching: they
 * place people and animals using existing sandbox commands, so each one is a
 * sequence of things the player could do by hand. They add to a world; they do
 * not start a new one.
 */
export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'founding-family',
    title: 'Founding family',
    detail: 'A couple with children settles the middle of the land, and their kin are crowned leader.',
    steps: (w, h) => {
      const c = at(w, h, 0.5, 0.5)
      return [
        { cmd: 'family', x: c.x, y: c.y },
        { cmd: 'make_leader', x: c.x, y: c.y, radius: 4 },
      ]
    },
  },
  {
    id: 'two-tribes',
    title: 'Two rival tribes',
    detail: 'Two groups of five start on opposite sides of the land, each with a little wild game nearby.',
    steps: (w, h) => {
      const west = at(w, h, 0.3, 0.45)
      const east = at(w, h, 0.7, 0.55)
      return [
        { cmd: 'spawn', x: west.x, y: west.y, count: 5 },
        { cmd: 'spawn', x: east.x, y: east.y, count: 5 },
        { cmd: 'spawn_animal', x: west.x, y: west.y, count: 3, radius: 6 },
        { cmd: 'spawn_animal', x: east.x, y: east.y, count: 3, radius: 6 },
      ]
    },
  },
  {
    id: 'wild-valley',
    title: 'Wild valley',
    detail: 'A herd of deer and rabbits is placed through the land, with a clear sky to start.',
    steps: (w, h) => {
      const points = [at(w, h, 0.25, 0.3), at(w, h, 0.6, 0.35), at(w, h, 0.45, 0.7)]
      return [
        { cmd: 'weather', kind: 'clear' },
        ...points.flatMap((p) => [
          { cmd: 'spawn_animal' as const, x: p.x, y: p.y, kind: 'deer', count: 3, radius: 5 },
          { cmd: 'spawn_animal' as const, x: p.x, y: p.y, kind: 'rabbit', count: 3, radius: 5 },
        ]),
      ]
    },
  },
]
