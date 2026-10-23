import type { SandboxCommand } from './sandbox'
import type { MessageKey } from '../i18n'

export interface ScenarioPreset {
  id: string
  /** Translation keys: the modal and the status line read them with t(). */
  title: MessageKey
  detail: MessageKey
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
    title: 'model.scenarios.foundingFamily.title',
    detail: 'model.scenarios.foundingFamily.detail',
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
    title: 'model.scenarios.twoTribes.title',
    detail: 'model.scenarios.twoTribes.detail',
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
    title: 'model.scenarios.wildValley.title',
    detail: 'model.scenarios.wildValley.detail',
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
    title: 'model.scenarios.apocalypse.title',
    detail: 'model.scenarios.apocalypse.detail',
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
    title: 'model.scenarios.goldenAge.title',
    detail: 'model.scenarios.goldenAge.detail',
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
    title: 'model.scenarios.tribalWar.title',
    detail: 'model.scenarios.tribalWar.detail',
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
    title: 'model.scenarios.islandSurvival.title',
    detail: 'model.scenarios.islandSurvival.detail',
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
    title: 'model.scenarios.iceAge.title',
    detail: 'model.scenarios.iceAge.detail',
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
