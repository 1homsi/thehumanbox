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
  {
    id: 'apocalypse',
    title: 'Apocalypse',
    detail:
      'A storm breaks over the land, a meteor falls in the middle, a plague spreads, and zombies walk the edges.',
    steps: (w, h) => {
      const c = at(w, h, 0.5, 0.5)
      const west = at(w, h, 0.25, 0.6)
      const east = at(w, h, 0.75, 0.4)
      return [
        { cmd: 'weather', kind: 'storm' },
        { cmd: 'meteor', x: c.x, y: c.y, radius: 6 },
        { cmd: 'outbreak', count: 12 },
        { cmd: 'spawn_animal', x: west.x, y: west.y, kind: 'zombie', count: 3, radius: 5 },
        { cmd: 'spawn_animal', x: east.x, y: east.y, kind: 'zombie', count: 3, radius: 5 },
      ]
    },
  },
  {
    id: 'golden-age',
    title: 'Golden age',
    detail:
      'Clear skies, a bounty of food and warm sun over the middle, and two families founding their tribes on the good ground.',
    steps: (w, h) => {
      const c = at(w, h, 0.5, 0.5)
      const west = at(w, h, 0.3, 0.5)
      const east = at(w, h, 0.7, 0.5)
      return [
        { cmd: 'weather', kind: 'clear' },
        { cmd: 'bounty', x: c.x, y: c.y, radius: 10 },
        { cmd: 'sunshine', x: c.x, y: c.y, radius: 10 },
        { cmd: 'family', x: west.x, y: west.y },
        { cmd: 'family', x: east.x, y: east.y },
      ]
    },
  },
  {
    id: 'tribal-war',
    title: 'Tribal war',
    detail: 'Two families found rival tribes on either side of the land, and the gods set them at war.',
    steps: (w, h) => {
      const c = at(w, h, 0.5, 0.5)
      const west = at(w, h, 0.3, 0.5)
      const east = at(w, h, 0.7, 0.5)
      return [
        { cmd: 'family', x: west.x, y: west.y },
        { cmd: 'family', x: east.x, y: east.y },
        { cmd: 'war', x: c.x, y: c.y },
      ]
    },
  },
  {
    id: 'island-survival',
    title: 'Island survival',
    detail: 'A band of six starts in the middle with deer and rabbits about, and rain to drink.',
    steps: (w, h) => {
      const c = at(w, h, 0.5, 0.5)
      return [
        { cmd: 'weather', kind: 'rain' },
        { cmd: 'spawn', x: c.x, y: c.y, count: 6 },
        { cmd: 'spawn_animal', x: c.x, y: c.y, kind: 'deer', count: 3, radius: 4 },
        { cmd: 'spawn_animal', x: c.x, y: c.y, kind: 'rabbit', count: 3, radius: 4 },
      ]
    },
  },
  {
    id: 'ice-age',
    title: 'Ice age',
    detail:
      'Snow falls and a blizzard sweeps the middle while a small band and a few bears are left to endure it.',
    steps: (w, h) => {
      const c = at(w, h, 0.5, 0.5)
      const west = at(w, h, 0.3, 0.6)
      return [
        { cmd: 'weather', kind: 'snow' },
        { cmd: 'blizzard', x: c.x, y: c.y, radius: 12 },
        { cmd: 'spawn', x: west.x, y: west.y, count: 6 },
        { cmd: 'spawn_animal', x: west.x, y: west.y, kind: 'bear', count: 2, radius: 5 },
      ]
    },
  },
]
