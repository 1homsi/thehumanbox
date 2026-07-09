export type SandboxCommand =
  | { cmd: 'spawn'; x: number; y: number; count?: number; lineage?: string }
  | { cmd: 'smite'; x: number; y: number; radius?: number }
  | { cmd: 'heal'; x: number; y: number; radius?: number }
  | { cmd: 'paint'; x: number; y: number; tile: string; radius?: number }
  | { cmd: 'ignite'; x: number; y: number; radius?: number }
  | { cmd: 'weather'; kind: 'clear' | 'rain' | 'storm' }
  | { cmd: 'drought'; active: boolean }
  | { cmd: 'outbreak'; count?: number }
  | { cmd: 'spawn_animal'; x: number; y: number; kind?: string }

/**
 * Command permission belongs at the transport boundary, not just the toolbar.
 * This makes 2D, 3D, shortcuts, and future controls obey the same rule.
 */
export function canSendSandboxCommand(
  source: 'remote' | 'wasm',
  desktop: boolean,
  localServer: boolean,
): boolean {
  return source === 'wasm' || (desktop && localServer)
}

export type TimeControl = { control: 'pause' | 'resume' | 'speed'; mult?: number }

export interface SandboxTool {
  id: string
  label: string
  icon: string
  mode: 'point' | 'instant'
  build?: (x: number, y: number, brush: number) => SandboxCommand
  fire?: SandboxCommand
  time?: TimeControl
}

export interface SandboxCategory {
  id: string
  label: string
  icon: string
  tools: SandboxTool[]
}

export const SANDBOX_CATEGORIES: SandboxCategory[] = [
  {
    id: 'life',
    label: 'life',
    icon: '🚶',
    tools: [
      {
        id: 'spawn1',
        label: 'spawn',
        icon: '✚',
        mode: 'point',
        build: (x, y) => ({ cmd: 'spawn', x, y, count: 1 }),
      },
      {
        id: 'spawn5',
        label: 'tribe',
        icon: '👥',
        mode: 'point',
        build: (x, y) => ({ cmd: 'spawn', x, y, count: 5 }),
      },
      {
        id: 'heal',
        label: 'heal',
        icon: '💚',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'heal', x, y, radius: 2 + b }),
      },
      {
        id: 'smite',
        label: 'smite',
        icon: '💀',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'smite', x, y, radius: 2 + b }),
      },
    ],
  },
  {
    id: 'terrain',
    label: 'terrain',
    icon: '⛰️',
    tools: [
      {
        id: 'grass',
        label: 'grass',
        icon: '🟩',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'paint', x, y, tile: 'grass', radius: b }),
      },
      {
        id: 'water',
        label: 'water',
        icon: '🟦',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'paint', x, y, tile: 'water', radius: b }),
      },
      {
        id: 'rock',
        label: 'rock',
        icon: '🪨',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'paint', x, y, tile: 'rock', radius: b }),
      },
      {
        id: 'sand',
        label: 'sand',
        icon: '🟨',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'paint', x, y, tile: 'sand', radius: b }),
      },
      {
        id: 'snow',
        label: 'snow',
        icon: '❄️',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'paint', x, y, tile: 'snow', radius: b }),
      },
    ],
  },
  {
    id: 'resources',
    label: 'resources',
    icon: '🍎',
    tools: [
      {
        id: 'food',
        label: 'food',
        icon: '🍎',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'paint', x, y, tile: 'food', radius: b }),
      },
      {
        id: 'drink',
        label: 'water',
        icon: '💧',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'paint', x, y, tile: 'water', radius: b }),
      },
    ],
  },
  {
    id: 'animals',
    label: 'animals',
    icon: '🦌',
    tools: [
      {
        id: 'deer',
        label: 'deer',
        icon: '🦌',
        mode: 'point',
        build: (x, y) => ({ cmd: 'spawn_animal', x, y, kind: 'deer' }),
      },
      {
        id: 'rabbit',
        label: 'rabbit',
        icon: '🐇',
        mode: 'point',
        build: (x, y) => ({ cmd: 'spawn_animal', x, y, kind: 'rabbit' }),
      },
      {
        id: 'boar',
        label: 'boar',
        icon: '🐗',
        mode: 'point',
        build: (x, y) => ({ cmd: 'spawn_animal', x, y, kind: 'boar' }),
      },
      {
        id: 'wolf',
        label: 'wolf',
        icon: '🐺',
        mode: 'point',
        build: (x, y) => ({ cmd: 'spawn_animal', x, y, kind: 'wolf' }),
      },
      {
        id: 'bird',
        label: 'bird',
        icon: '🐦',
        mode: 'point',
        build: (x, y) => ({ cmd: 'spawn_animal', x, y, kind: 'bird' }),
      },
      {
        id: 'fish',
        label: 'fish',
        icon: '🐟',
        mode: 'point',
        build: (x, y) => ({ cmd: 'spawn_animal', x, y, kind: 'fish' }),
      },
    ],
  },
  {
    id: 'nature',
    label: 'nature',
    icon: '🌧️',
    tools: [
      { id: 'rain', label: 'rain', icon: '🌧️', mode: 'instant', fire: { cmd: 'weather', kind: 'rain' } },
      { id: 'storm', label: 'storm', icon: '⛈️', mode: 'instant', fire: { cmd: 'weather', kind: 'storm' } },
      { id: 'clear', label: 'clear', icon: '☀️', mode: 'instant', fire: { cmd: 'weather', kind: 'clear' } },
      {
        id: 'drought_on',
        label: 'drought',
        icon: '🏜️',
        mode: 'instant',
        fire: { cmd: 'drought', active: true },
      },
      {
        id: 'drought_off',
        label: 'end dry',
        icon: '🌦️',
        mode: 'instant',
        fire: { cmd: 'drought', active: false },
      },
    ],
  },
  {
    id: 'disasters',
    label: 'disasters',
    icon: '🔥',
    tools: [
      {
        id: 'fire',
        label: 'fire',
        icon: '🔥',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'ignite', x, y, radius: 1 + b }),
      },
      { id: 'plague', label: 'plague', icon: '🦠', mode: 'instant', fire: { cmd: 'outbreak', count: 12 } },
    ],
  },
  {
    id: 'time',
    label: 'time',
    icon: '⏱️',
    tools: [
      { id: 'pause', label: 'pause', icon: '⏸️', mode: 'instant', time: { control: 'pause' } },
      { id: 'play', label: 'play', icon: '▶️', mode: 'instant', time: { control: 'resume' } },
      { id: 'slow', label: 'slow', icon: '🐢', mode: 'instant', time: { control: 'speed', mult: 0.5 } },
      { id: 'normal', label: '1×', icon: '⏱️', mode: 'instant', time: { control: 'speed', mult: 1 } },
      { id: 'fast', label: 'fast', icon: '⏩', mode: 'instant', time: { control: 'speed', mult: 3 } },
    ],
  },
]
