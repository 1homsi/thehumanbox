export type SandboxCommand =
  | { cmd: 'spawn'; x: number; y: number; count?: number; lineage?: string }
  | { cmd: 'smite'; x: number; y: number; radius?: number }
  | { cmd: 'heal'; x: number; y: number; radius?: number }
  | { cmd: 'paint'; x: number; y: number; tile: string; radius?: number }
  | { cmd: 'ignite'; x: number; y: number; radius?: number }
  | { cmd: 'weather'; kind: 'clear' | 'rain' | 'storm' | 'snow' | 'fog' | 'monsoon' | 'cold_snap' }
  | { cmd: 'gale' }
  | { cmd: 'tornado'; x: number; y: number; radius?: number }
  | { cmd: 'tsunami'; x: number; y: number; radius?: number }
  | { cmd: 'locusts'; x: number; y: number; radius?: number }
  | { cmd: 'long_life'; x: number; y: number; radius?: number }
  | { cmd: 'courage'; x: number; y: number; radius?: number }
  | { cmd: 'wildfire'; x: number; y: number; radius?: number }
  | { cmd: 'sunshine'; x: number; y: number; radius?: number }
  | { cmd: 'drought'; active: boolean }
  | { cmd: 'outbreak'; count?: number }
  | { cmd: 'restore'; x: number; y: number; radius?: number }
  | { cmd: 'spawn_animal'; x: number; y: number; kind?: string; count?: number; radius?: number }
  | { cmd: 'poison'; x: number; y: number; radius?: number }
  | { cmd: 'meteor'; x: number; y: number; radius?: number }
  | { cmd: 'bless'; x: number; y: number; radius?: number }
  | { cmd: 'inspire'; x: number; y: number; radius?: number }
  | { cmd: 'earthquake'; x: number; y: number; radius?: number }
  | { cmd: 'war'; x: number; y: number }
  | { cmd: 'peace'; x: number; y: number }
  | { cmd: 'harvest'; x: number; y: number; radius?: number }
  | { cmd: 'cure'; x: number; y: number; radius?: number }
  | { cmd: 'arm'; x: number; y: number; radius?: number }
  | { cmd: 'bounty'; x: number; y: number; radius?: number }
  | { cmd: 'douse'; x: number; y: number; radius?: number }
  | { cmd: 'banish'; x: number; y: number; radius?: number }
  | { cmd: 'revive'; x: number; y: number }
  | { cmd: 'rename_tribe'; lineage: string; name: string }
  | { cmd: 'teach'; lineage: string }
  | { cmd: 'ward'; x: number; y: number; radius?: number }
  | { cmd: 'blight'; x: number; y: number; radius?: number }
  | { cmd: 'frenzy'; x: number; y: number; radius?: number }
  | { cmd: 'flood'; x: number; y: number; radius?: number }
  | { cmd: 'blizzard'; x: number; y: number; radius?: number }
  | { cmd: 'thunder'; x: number; y: number; radius?: number }
  | { cmd: 'paint_biome'; x: number; y: number; biome: string; radius?: number }
  | {
      cmd: 'plant'
      x: number
      y: number
      kind: 'crop' | 'orchard' | 'sapling' | 'flowers' | 'berry' | 'mushroom' | 'oak' | 'pine' | 'palm'
      radius?: number
    }
  | { cmd: 'volcano'; x: number; y: number; radius?: number }
  | { cmd: 'meteor_shower'; x: number; y: number; radius?: number }
  | { cmd: 'love'; x: number; y: number; radius?: number }
  | { cmd: 'marry'; ax: number; ay: number; bx: number; by: number }
  | { cmd: 'merge_tribes'; ax: number; ay: number; bx: number; by: number }
  | { cmd: 'split_tribe'; x: number; y: number; radius?: number }
  | { cmd: 'rename_person'; id: string; name: string }
  | { cmd: 'tame'; x: number; y: number; radius?: number }
  | { cmd: 'family'; x: number; y: number }
  | { cmd: 'teleport'; x: number; y: number; radius?: number }
  | { cmd: 'make_leader'; x: number; y: number; radius?: number }
  | { cmd: 'heal_one'; x: number; y: number; radius?: number }
  | { cmd: 'mutate'; x: number; y: number; radius?: number }
  | { cmd: 'curse'; x: number; y: number; radius?: number }
  | { cmd: 'teach_nearby'; x: number; y: number; radius?: number }
  | { cmd: 'advance'; to: 'season' | 'year'; max_ticks?: number }
  | { cmd: 'gift'; x: number; y: number; radius?: number; what: 'food' | 'tool' }
  | { cmd: 'time_of_day'; phase: 'dawn' | 'noon' | 'dusk' | 'midnight' }
  | { cmd: 'hail'; x: number; y: number; radius?: number }
  | { cmd: 'nuke'; x: number; y: number }
  | { cmd: 'eclipse' }
  | { cmd: 'clear_region'; x: number; y: number; radius?: number }
  | { cmd: 'comet'; x: number; y: number; radius?: number }
  | { cmd: 'demolish'; x: number; y: number; radius?: number }
  | { cmd: 'repair'; x: number; y: number; radius?: number }
  | { cmd: 'road'; x: number; y: number; radius?: number; kind: 'road' | 'bridge' | 'erase' }
  | { cmd: 'place_building'; x: number; y: number; kind: string }
  | {
      cmd: 'guide'
      lineage: string
      strategy: LineageStrategy
      duration_ticks?: number
    }

/**
 * The dice tool's events: a mix of kind and cruel things, each landing at a
 * place it is given (weather and the wind ignore the place).
 */
const DICE_EVENTS: ReadonlyArray<(x: number, y: number) => SandboxCommand> = [
  () => ({ cmd: 'weather', kind: 'rain' }),
  () => ({ cmd: 'gale' }),
  (x, y) => ({ cmd: 'bless', x, y, radius: 6 }),
  (x, y) => ({ cmd: 'harvest', x, y, radius: 6 }),
  (x, y) => ({ cmd: 'spawn', x, y, count: 5 }),
  (x, y) => ({ cmd: 'spawn_animal', x, y, kind: 'deer', count: 4, radius: 4 }),
  (x, y) => ({ cmd: 'meteor', x, y, radius: 3 }),
  (x, y) => ({ cmd: 'tornado', x, y, radius: 12 }),
  (x, y) => ({ cmd: 'wildfire', x, y, radius: 10 }),
  (x, y) => ({ cmd: 'earthquake', x, y, radius: 5 }),
  (x, y) => ({ cmd: 'locusts', x, y, radius: 12 }),
]

/**
 * Roll the dice: one random event at a random place on a world of the given
 * size. `random` is injectable so the roll can be tested.
 */
export function rollRandomEvent(
  width: number,
  height: number,
  random: () => number = Math.random,
): SandboxCommand {
  const event = DICE_EVENTS[Math.floor(random() * DICE_EVENTS.length) % DICE_EVENTS.length]
  const x = Math.floor(random() * Math.max(1, width))
  const y = Math.floor(random() * Math.max(1, height))
  return event(x, y)
}

export type LineageStrategy = 'hunt' | 'explore' | 'settle' | 'trade' | 'defend'

/**
 * Command permission belongs at the transport boundary, not just the toolbar.
 * This makes 2D, 3D, shortcuts, and future controls obey the same rule.
 */
export function canSendSandboxCommand(
  source: 'native' | 'wasm',
  desktop: boolean,
  localServer: boolean,
): boolean {
  return source === 'wasm' || (desktop && localServer)
}

export type TimeControl = {
  control: 'pause' | 'resume' | 'speed' | 'advance'
  mult?: number
  /** For `advance`: run to the next season or year boundary. */
  to?: 'season' | 'year'
}

export type SandboxOverlay =
  'density' | 'hazard' | 'fertility' | 'structures' | 'trails' | 'age' | 'threat' | 'food' | 'wealth' | 'mood'

export type SandboxViewFlag =
  'territory' | 'history' | 'names' | 'thoughts' | 'animals' | 'grid' | 'tradeRoutes'

export type SandboxViewControl =
  { control: 'overlay'; value: SandboxOverlay } | { control: 'flag'; value: SandboxViewFlag }

export interface SandboxTool {
  id: string
  label: string
  icon: string
  mode: 'point' | 'instant'
  build?: (x: number, y: number, brush: number) => SandboxCommand
  fire?: SandboxCommand
  time?: TimeControl
  view?: SandboxViewControl
}

export interface SandboxCategory {
  id: string
  label: string
  icon: string
  tools: SandboxTool[]
}

export function isSandboxViewControlActive(
  view: SandboxViewControl | undefined,
  overlay: string | null,
  flags: Partial<Record<SandboxViewFlag, boolean>>,
): boolean {
  if (!view) return false
  return view.control === 'overlay' ? overlay === view.value : flags[view.value] === true
}

export const SANDBOX_CATEGORIES: SandboxCategory[] = [
  {
    id: 'life',
    label: 'life',
    icon: '🚶',
    tools: [
      {
        id: 'spawn1',
        label: 'person',
        icon: '🚶',
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
        id: 'family',
        label: 'family',
        icon: '👪',
        mode: 'point',
        build: (x, y) => ({ cmd: 'family', x, y }),
      },
      {
        id: 'heal_one',
        label: 'heal one',
        icon: '💚',
        mode: 'point',
        build: (x, y) => ({ cmd: 'heal_one', x, y, radius: 4 }),
      },
      {
        id: 'mutate',
        label: 'mutate',
        icon: '🧬',
        mode: 'point',
        build: (x, y) => ({ cmd: 'mutate', x, y, radius: 4 }),
      },
      {
        id: 'curse',
        label: 'curse one',
        icon: '🧿',
        mode: 'point',
        build: (x, y) => ({ cmd: 'curse', x, y, radius: 4 }),
      },
      {
        id: 'teach_tribe',
        label: 'teach',
        icon: '📜',
        mode: 'point',
        build: (x, y) => ({ cmd: 'teach_nearby', x, y, radius: 4 }),
      },
      {
        id: 'follow',
        label: 'follow',
        icon: '👣',
        mode: 'point',
      },
      {
        // Opens the name editor on the person nearest the click. The name is typed on their card.
        id: 'name',
        label: 'name',
        icon: '✏️',
        mode: 'point',
      },
      {
        // Two clicks: the first person, then the second. Sent by the app, not by a single click.
        id: 'marry',
        label: 'marry',
        icon: '💍',
        mode: 'point',
      },
      {
        // Two clicks: a person of one tribe, then a person of another. Sent by the app (see PAIR_TOOLS).
        id: 'merge_tribes',
        label: 'merge tribes',
        icon: '🤝',
        mode: 'point',
      },
      {
        id: 'split_tribe',
        label: 'split tribe',
        icon: '🪓',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'split_tribe', x, y, radius: 3 + b }),
      },
      {
        id: 'teleport',
        label: 'teleport',
        icon: '🌀',
        mode: 'point',
        build: (x, y) => ({ cmd: 'teleport', x, y, radius: 4 }),
      },
      {
        id: 'gift_food',
        label: 'gift food',
        icon: '🎁',
        mode: 'point',
        build: (x, y) => ({ cmd: 'gift', x, y, radius: 4, what: 'food' }),
      },
      {
        id: 'gift_tool',
        label: 'gift tool',
        icon: '🔧',
        mode: 'point',
        build: (x, y) => ({ cmd: 'gift', x, y, radius: 4, what: 'tool' }),
      },
      {
        id: 'leader',
        label: 'crown',
        icon: '🤴',
        mode: 'point',
        build: (x, y) => ({ cmd: 'make_leader', x, y, radius: 4 }),
      },
    ],
  },
  {
    id: 'good',
    label: 'helpful',
    icon: '✨',
    tools: [
      {
        id: 'heal',
        label: 'heal',
        icon: '❤️',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'heal', x, y, radius: 2 + b }),
      },
      {
        id: 'revive',
        label: 'revive',
        icon: '☥',
        mode: 'point',
        build: (x, y) => ({ cmd: 'revive', x, y }),
      },
      {
        id: 'bless',
        label: 'bless',
        icon: '✨',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'bless', x, y, radius: 2 + b }),
      },
      {
        id: 'inspire',
        label: 'inspire',
        icon: '💡',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'inspire', x, y, radius: 2 + b }),
      },
      {
        id: 'long_life',
        label: 'long life',
        icon: '🕰️',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'long_life', x, y, radius: 2 + b }),
      },
      {
        id: 'courage',
        label: 'courage',
        icon: '🦁',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'courage', x, y, radius: 3 + b }),
      },
      {
        id: 'sunshine',
        label: 'sunshine',
        icon: '🌞',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'sunshine', x, y, radius: 4 + b }),
      },
      {
        id: 'peace',
        label: 'peace',
        icon: '🕊️',
        mode: 'point',
        build: (x, y) => ({ cmd: 'peace', x, y }),
      },
      {
        id: 'cure',
        label: 'cure',
        icon: '💊',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'cure', x, y, radius: 6 + b }),
      },
      {
        id: 'harvest',
        label: 'harvest',
        icon: '🌾',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'harvest', x, y, radius: 3 + b }),
      },
      {
        id: 'arm',
        label: 'arm',
        icon: '🗡️',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'arm', x, y, radius: 2 + b }),
      },
      {
        id: 'bounty',
        label: 'bounty',
        icon: '🎁',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'bounty', x, y, radius: 2 + b }),
      },
      {
        id: 'douse',
        label: 'douse',
        icon: '🪣',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'douse', x, y, radius: 3 + b }),
      },
      {
        id: 'ward',
        label: 'ward',
        icon: '🔰',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'ward', x, y, radius: 6 + b * 2 }),
      },
      {
        id: 'banish',
        label: 'banish',
        icon: '🛡️',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'banish', x, y, radius: 4 + b }),
      },
      {
        id: 'love',
        label: 'love',
        icon: '💞',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'love', x, y, radius: 4 + b }),
      },
      {
        id: 'tame',
        label: 'tame',
        icon: '🦮',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'tame', x, y, radius: 4 + b }),
      },
      { id: 'rain', label: 'rain', icon: '🌧️', mode: 'instant', fire: { cmd: 'weather', kind: 'rain' } },
      { id: 'clear', label: 'clear', icon: '☀️', mode: 'instant', fire: { cmd: 'weather', kind: 'clear' } },
      { id: 'fog', label: 'fog', icon: '🌫️', mode: 'instant', fire: { cmd: 'weather', kind: 'fog' } },
      { id: 'gale', label: 'gale', icon: '🌬️', mode: 'instant', fire: { cmd: 'gale' } },
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
    id: 'bad',
    label: 'deadly',
    icon: '💀',
    tools: [
      {
        id: 'smite',
        label: 'smite',
        icon: '💀',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'smite', x, y, radius: 2 + b }),
      },
      {
        id: 'war',
        label: 'war',
        icon: '⚔️',
        mode: 'point',
        build: (x, y) => ({ cmd: 'war', x, y }),
      },
      {
        id: 'frenzy',
        label: 'frenzy',
        icon: '😡',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'frenzy', x, y, radius: 2 + b }),
      },
      {
        id: 'thunder',
        label: 'thunder',
        icon: '🌩️',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'thunder', x, y, radius: 5 + b }),
      },
      {
        id: 'fire',
        label: 'fire',
        icon: '🔥',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'ignite', x, y, radius: 1 + b }),
      },
      { id: 'plague', label: 'plague', icon: '🦠', mode: 'instant', fire: { cmd: 'outbreak', count: 12 } },
      {
        id: 'poison',
        label: 'poison',
        icon: '🧪',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'poison', x, y, radius: 1 + b }),
      },
      {
        id: 'blight',
        label: 'blight',
        icon: '🥀',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'blight', x, y, radius: 3 + b }),
      },
      {
        id: 'earthquake',
        label: 'quake',
        icon: '〽️',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'earthquake', x, y, radius: 3 + b }),
      },
      {
        id: 'tornado',
        label: 'tornado',
        icon: '🌪️',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'tornado', x, y, radius: 6 + b }),
      },
      {
        id: 'tsunami',
        label: 'tsunami',
        icon: '🫧',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'tsunami', x, y, radius: 8 + b }),
      },
      {
        id: 'locusts',
        label: 'locusts',
        icon: '🦗',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'locusts', x, y, radius: 10 + b }),
      },
      {
        id: 'wildfire',
        label: 'wildfire',
        icon: '🪵',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'wildfire', x, y, radius: 6 + b }),
      },
      {
        id: 'meteor',
        label: 'meteor',
        icon: '☄️',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'meteor', x, y, radius: 2 + b }),
      },
      {
        id: 'meteor_shower',
        label: 'starfall',
        icon: '🌠',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'meteor_shower', x, y, radius: 8 + b }),
      },
      {
        id: 'volcano',
        label: 'volcano',
        icon: '🌋',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'volcano', x, y, radius: 4 + b }),
      },
      {
        id: 'flood',
        label: 'flood',
        icon: '🌊',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'flood', x, y, radius: 2 + b }),
      },
      {
        id: 'blizzard',
        label: 'blizzard',
        icon: '🌨️',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'blizzard', x, y, radius: 4 + b }),
      },
      {
        id: 'hail',
        label: 'hail',
        icon: '☁️',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'hail', x, y, radius: 5 + b }),
      },
      { id: 'storm', label: 'storm', icon: '⛈️', mode: 'instant', fire: { cmd: 'weather', kind: 'storm' } },
      {
        id: 'snow_weather',
        label: 'snowfall',
        icon: '☃️',
        mode: 'instant',
        fire: { cmd: 'weather', kind: 'snow' },
      },
      {
        id: 'drought_on',
        label: 'drought',
        icon: '🏜️',
        mode: 'instant',
        fire: { cmd: 'drought', active: true },
      },
    ],
  },
  {
    id: 'build',
    label: 'build',
    icon: '🏠',
    tools: [
      {
        id: 'shelter',
        label: 'shelter',
        icon: '🛖',
        mode: 'point',
        build: (x, y) => ({ cmd: 'paint', x, y, tile: 'hut', radius: 0 }),
      },
      {
        id: 'campfire',
        label: 'campfire',
        icon: '🔥',
        mode: 'point',
        build: (x, y) => ({ cmd: 'paint', x, y, tile: 'campfire', radius: 0 }),
      },
      {
        id: 'demolish',
        label: 'demolish',
        icon: '⛏️',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'demolish', x, y, radius: 1 + b }),
      },
      {
        id: 'repair',
        label: 'repair',
        icon: '🔨',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'repair', x, y, radius: 2 + b }),
      },
      {
        id: 'road',
        label: 'road',
        icon: '🛤️',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'road', x, y, radius: b, kind: 'road' }),
      },
      {
        id: 'bridge',
        label: 'bridge',
        icon: '🌉',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'road', x, y, radius: b, kind: 'bridge' }),
      },
      {
        id: 'road_erase',
        label: 'unroad',
        icon: '🧽',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'road', x, y, radius: b, kind: 'erase' }),
      },
      {
        id: 'place_house',
        label: 'house',
        icon: '🏠',
        mode: 'point',
        build: (x, y) => ({ cmd: 'place_building', x, y, kind: 'house' }),
      },
      {
        id: 'place_library',
        label: 'library',
        icon: '📖',
        mode: 'point',
        build: (x, y) => ({ cmd: 'place_building', x, y, kind: 'library' }),
      },
    ],
  },
  {
    id: 'terrain',
    label: 'terrain',
    icon: '⛰️',
    tools: [
      {
        id: 'clear_region',
        label: 'clear',
        icon: '🧹',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'clear_region', x, y, radius: 2 + b }),
      },
      {
        id: 'restore',
        label: 'eraser',
        icon: '🧽',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'restore', x, y, radius: b }),
      },
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
    id: 'sky',
    label: 'sky',
    icon: '🌅',
    tools: [
      {
        id: 'dawn',
        label: 'dawn',
        icon: '🌅',
        mode: 'instant',
        fire: { cmd: 'time_of_day', phase: 'dawn' },
      },
      {
        id: 'noon',
        label: 'noon',
        icon: '🕛',
        mode: 'instant',
        fire: { cmd: 'time_of_day', phase: 'noon' },
      },
      {
        id: 'dusk',
        label: 'dusk',
        icon: '🌇',
        mode: 'instant',
        fire: { cmd: 'time_of_day', phase: 'dusk' },
      },
      {
        id: 'midnight',
        label: 'midnight',
        icon: '🌙',
        mode: 'instant',
        fire: { cmd: 'time_of_day', phase: 'midnight' },
      },
      {
        id: 'nuke',
        label: 'bomb',
        icon: '☢️',
        mode: 'point',
        build: (x, y) => ({ cmd: 'nuke', x, y }),
      },
      {
        id: 'eclipse',
        label: 'eclipse',
        icon: '🌑',
        mode: 'instant',
        fire: { cmd: 'eclipse' },
      },
      {
        id: 'monsoon',
        label: 'monsoon',
        icon: '☔',
        mode: 'instant',
        fire: { cmd: 'weather', kind: 'monsoon' },
      },
      {
        id: 'cold_snap',
        label: 'cold snap',
        icon: '🥶',
        mode: 'instant',
        fire: { cmd: 'weather', kind: 'cold_snap' },
      },
      {
        id: 'comet',
        label: 'comet',
        icon: '💫',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'comet', x, y, radius: 12 + b * 4 }),
      },
      // The fire command is a placeholder: the toolbar rolls a random event when it is picked.
      { id: 'dice', label: 'dice', icon: '🎲', mode: 'instant', fire: { cmd: 'gale' } },
    ],
  },
  {
    id: 'biomes',
    label: 'biomes',
    icon: '🌳',
    tools: [
      {
        id: 'biome_grassland',
        label: 'meadow',
        icon: '🌱',
        mode: 'point',
        build: (x, y, r) => ({ cmd: 'paint_biome', x, y, biome: 'grassland', radius: 3 + r }),
      },
      {
        id: 'biome_forest',
        label: 'forest',
        icon: '🌳',
        mode: 'point',
        build: (x, y, r) => ({ cmd: 'paint_biome', x, y, biome: 'forest', radius: 3 + r }),
      },
      {
        id: 'biome_jungle',
        label: 'jungle',
        icon: '🌴',
        mode: 'point',
        build: (x, y, r) => ({ cmd: 'paint_biome', x, y, biome: 'jungle', radius: 3 + r }),
      },
      {
        id: 'biome_savanna',
        label: 'savanna',
        icon: '🦒',
        mode: 'point',
        build: (x, y, r) => ({ cmd: 'paint_biome', x, y, biome: 'savanna', radius: 3 + r }),
      },
      {
        id: 'biome_desert',
        label: 'desert',
        icon: '🌵',
        mode: 'point',
        build: (x, y, r) => ({ cmd: 'paint_biome', x, y, biome: 'desert', radius: 3 + r }),
      },
      {
        id: 'biome_badlands',
        label: 'badlands',
        icon: '🟥',
        mode: 'point',
        build: (x, y, r) => ({ cmd: 'paint_biome', x, y, biome: 'badlands', radius: 3 + r }),
      },
      {
        id: 'biome_wetland',
        label: 'wetland',
        icon: '🪷',
        mode: 'point',
        build: (x, y, r) => ({ cmd: 'paint_biome', x, y, biome: 'wetland', radius: 3 + r }),
      },
      {
        id: 'biome_tundra',
        label: 'tundra',
        icon: '🧊',
        mode: 'point',
        build: (x, y, r) => ({ cmd: 'paint_biome', x, y, biome: 'tundra', radius: 3 + r }),
      },
      {
        id: 'biome_taiga',
        label: 'taiga',
        icon: '🌲',
        mode: 'point',
        build: (x, y, r) => ({ cmd: 'paint_biome', x, y, biome: 'taiga', radius: 3 + r }),
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
        label: 'spring',
        icon: '💧',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'paint', x, y, tile: 'water', radius: b }),
      },
      {
        id: 'plant_crop',
        label: 'crops',
        icon: '🌿',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'plant', x, y, kind: 'crop', radius: 1 + b }),
      },
      {
        id: 'plant_orchard',
        label: 'orchard',
        icon: '🍐',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'plant', x, y, kind: 'orchard', radius: 1 + b }),
      },
      {
        id: 'plant_sapling',
        label: 'saplings',
        icon: '🪴',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'plant', x, y, kind: 'sapling', radius: 2 + b }),
      },
      {
        id: 'plant_berry',
        label: 'berries',
        icon: '🫐',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'plant', x, y, kind: 'berry', radius: 1 + b }),
      },
      {
        id: 'plant_mushroom',
        label: 'mushrooms',
        icon: '🍄',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'plant', x, y, kind: 'mushroom', radius: 1 + b }),
      },
      {
        id: 'plant_oak',
        label: 'oaks',
        icon: '🌰',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'plant', x, y, kind: 'oak', radius: 2 + b }),
      },
      {
        id: 'plant_pine',
        label: 'pines',
        icon: '🎄',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'plant', x, y, kind: 'pine', radius: 2 + b }),
      },
      {
        id: 'plant_palm',
        label: 'palms',
        icon: '🥥',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'plant', x, y, kind: 'palm', radius: 1 + b }),
      },
      {
        id: 'plant_flowers',
        label: 'flowers',
        icon: '🌸',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'plant', x, y, kind: 'flowers', radius: 1 + b }),
      },
    ],
  },
  {
    id: 'maps',
    label: 'maps',
    icon: '🗺️',
    tools: [
      {
        id: 'territory_map',
        label: 'borders',
        icon: '⬡',
        mode: 'instant',
        view: { control: 'flag', value: 'territory' },
      },
      {
        id: 'settlement_map',
        label: 'towns',
        icon: '🏘️',
        mode: 'instant',
        view: { control: 'overlay', value: 'structures' },
      },
      {
        id: 'population_map',
        label: 'people',
        icon: '👥',
        mode: 'instant',
        view: { control: 'overlay', value: 'density' },
      },
      {
        id: 'hazard_map',
        label: 'danger',
        icon: '⚔️',
        mode: 'instant',
        view: { control: 'overlay', value: 'hazard' },
      },
      {
        id: 'routes_map',
        label: 'routes',
        icon: '〰️',
        mode: 'instant',
        view: { control: 'overlay', value: 'trails' },
      },
      {
        id: 'migration_map',
        label: 'history',
        icon: '🧭',
        mode: 'instant',
        view: { control: 'flag', value: 'history' },
      },
      {
        id: 'trade_map',
        label: 'trade',
        icon: '🐫',
        mode: 'instant',
        view: { control: 'flag', value: 'tradeRoutes' },
      },
      {
        id: 'fertility_map',
        label: 'fertile',
        icon: '🌼',
        mode: 'instant',
        view: { control: 'overlay', value: 'fertility' },
      },
      {
        id: 'age_map',
        label: 'age',
        icon: '⏳',
        mode: 'instant',
        view: { control: 'overlay', value: 'age' },
      },
      {
        id: 'threat_map',
        label: 'threat',
        icon: '⚠️',
        mode: 'instant',
        view: { control: 'overlay', value: 'threat' },
      },
      {
        id: 'food_map',
        label: 'food',
        icon: '🍎',
        mode: 'instant',
        view: { control: 'overlay', value: 'food' },
      },
      {
        id: 'wealth_map',
        label: 'wealth',
        icon: '🪙',
        mode: 'instant',
        view: { control: 'overlay', value: 'wealth' },
      },
      {
        id: 'mood_map',
        label: 'moods',
        icon: '💚',
        mode: 'instant',
        view: { control: 'overlay', value: 'mood' },
      },
    ],
  },
  {
    id: 'view',
    label: 'view',
    icon: '👁️',
    tools: [
      {
        id: 'names_view',
        label: 'names',
        icon: '🏷️',
        mode: 'instant',
        view: { control: 'flag', value: 'names' },
      },
      {
        id: 'thoughts_view',
        label: 'thoughts',
        icon: '💭',
        mode: 'instant',
        view: { control: 'flag', value: 'thoughts' },
      },
      {
        id: 'animals_view',
        label: 'animals',
        icon: '🐾',
        mode: 'instant',
        view: { control: 'flag', value: 'animals' },
      },
      {
        id: 'grid_view',
        label: 'grid',
        icon: '#️⃣',
        mode: 'instant',
        view: { control: 'flag', value: 'grid' },
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
        build: (x, y, b) => ({ cmd: 'spawn_animal', x, y, kind: 'deer', count: 1 + b, radius: b }),
      },
      {
        id: 'rabbit',
        label: 'rabbit',
        icon: '🐇',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'spawn_animal', x, y, kind: 'rabbit', count: 1 + b, radius: b }),
      },
      {
        id: 'boar',
        label: 'boar',
        icon: '🐗',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'spawn_animal', x, y, kind: 'boar', count: 1 + b, radius: b }),
      },
      {
        id: 'wolf',
        label: 'wolf',
        icon: '🐺',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'spawn_animal', x, y, kind: 'wolf', count: 1 + b, radius: b }),
      },
      {
        id: 'bird',
        label: 'bird',
        icon: '🐦',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'spawn_animal', x, y, kind: 'bird', count: 1 + b, radius: b }),
      },
      {
        id: 'fish',
        label: 'fish',
        icon: '🐟',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'spawn_animal', x, y, kind: 'fish', count: 1 + b, radius: b }),
      },
      {
        id: 'bear',
        label: 'bear',
        icon: '🐻',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'spawn_animal', x, y, kind: 'bear', count: 1 + b, radius: b }),
      },
      {
        id: 'sheep',
        label: 'sheep',
        icon: '🐑',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'spawn_animal', x, y, kind: 'sheep', count: 1 + b, radius: b }),
      },
      {
        id: 'cow',
        label: 'cow',
        icon: '🐄',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'spawn_animal', x, y, kind: 'cow', count: 1 + b, radius: b }),
      },
      {
        id: 'horse',
        label: 'horse',
        icon: '🐎',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'spawn_animal', x, y, kind: 'horse', count: 1 + b, radius: b }),
      },
      {
        id: 'chicken',
        label: 'chicken',
        icon: '🐔',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'spawn_animal', x, y, kind: 'chicken', count: 1 + b, radius: b }),
      },
      {
        id: 'fox',
        label: 'fox',
        icon: '🦊',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'spawn_animal', x, y, kind: 'fox', count: 1 + b, radius: b }),
      },
      {
        id: 'cat',
        label: 'cat',
        icon: '🐈',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'spawn_animal', x, y, kind: 'cat', count: 1 + b, radius: b }),
      },
      {
        id: 'penguin',
        label: 'penguin',
        icon: '🐧',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'spawn_animal', x, y, kind: 'penguin', count: 1 + b, radius: b }),
      },
      {
        id: 'camel',
        label: 'camel',
        icon: '🐪',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'spawn_animal', x, y, kind: 'camel', count: 1 + b, radius: b }),
      },
      {
        id: 'frog',
        label: 'frog',
        icon: '🐸',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'spawn_animal', x, y, kind: 'frog', count: 1 + b, radius: b }),
      },
      {
        id: 'whale',
        label: 'whale',
        icon: '🐋',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'spawn_animal', x, y, kind: 'whale', count: 1 + b, radius: b }),
      },
      {
        id: 'dog',
        label: 'dog',
        icon: '🐕',
        mode: 'point',
        build: (x, y, b) => ({ cmd: 'spawn_animal', x, y, kind: 'dog', count: 1 + b, radius: b }),
      },
    ],
  },
  {
    id: 'monsters',
    label: 'monsters',
    icon: '🧟',
    tools: [
      {
        id: 'zombie',
        label: 'zombie',
        icon: '🧟',
        mode: 'point',
        build: (x, y) => ({ cmd: 'spawn_animal', x, y, kind: 'zombie' }),
      },
      {
        id: 'demon',
        label: 'demon',
        icon: '👹',
        mode: 'point',
        build: (x, y) => ({ cmd: 'spawn_animal', x, y, kind: 'demon' }),
      },
      {
        id: 'dragon',
        label: 'dragon',
        icon: '🐉',
        mode: 'point',
        build: (x, y) => ({ cmd: 'spawn_animal', x, y, kind: 'dragon' }),
      },
      {
        id: 'alien',
        label: 'alien',
        icon: '👽',
        mode: 'point',
        build: (x, y) => ({ cmd: 'spawn_animal', x, y, kind: 'alien' }),
      },
      {
        id: 'ufo',
        label: 'ufo',
        icon: '🛸',
        mode: 'point',
        build: (x, y) => ({ cmd: 'spawn_animal', x, y, kind: 'ufo' }),
      },
    ],
  },
  {
    id: 'time',
    label: 'time',
    icon: '⏱️',
    tools: [
      { id: 'pause', label: 'pause', icon: '⏸️', mode: 'instant', time: { control: 'pause' } },
      { id: 'play', label: 'play', icon: '▶️', mode: 'instant', time: { control: 'resume' } },
      {
        id: 'next_season',
        label: 'next season',
        icon: '🍂',
        mode: 'instant',
        time: { control: 'advance', to: 'season' },
      },
      {
        id: 'next_year',
        label: 'next year',
        icon: '📅',
        mode: 'instant',
        time: { control: 'advance', to: 'year' },
      },
      { id: 'slow', label: 'slow', icon: '🐢', mode: 'instant', time: { control: 'speed', mult: 0.5 } },
      { id: 'normal', label: '1×', icon: '⏱️', mode: 'instant', time: { control: 'speed', mult: 1 } },
      { id: 'fast2', label: '2×', icon: '⏩', mode: 'instant', time: { control: 'speed', mult: 2 } },
      { id: 'fast4', label: '4×', icon: '⏩', mode: 'instant', time: { control: 'speed', mult: 4 } },
      { id: 'fast10', label: '10×', icon: '⏭️', mode: 'instant', time: { control: 'speed', mult: 10 } },
      { id: 'fast40', label: '40×', icon: '⚡', mode: 'instant', time: { control: 'speed', mult: 40 } },
      { id: 'fast50', label: '50×', icon: '⚡', mode: 'instant', time: { control: 'speed', mult: 50 } },
      { id: 'fast500', label: '500×', icon: '⚡', mode: 'instant', time: { control: 'speed', mult: 500 } },
      { id: 'fast5000', label: '5000×', icon: '⚡', mode: 'instant', time: { control: 'speed', mult: 5000 } },
    ],
  },
]

/** A tool that takes two clicks: the first picks one thing, the second the other, then the app sends the command. */
export interface PairTool {
  /** Shown while waiting for the second click. */
  next: string
  build: (first: { x: number; y: number }, second: { x: number; y: number }) => SandboxCommand
  done: string
  failed: string
}

export const PAIR_TOOLS: Record<string, PairTool> = {
  marry: {
    next: 'marry · now click the other person',
    build: (a, b) => ({ cmd: 'marry', ax: a.x, ay: a.y, bx: b.x, by: b.y }),
    done: 'married · they are partners now',
    failed: 'marry · both must be grown, free to wed, of different sexes, and close to the clicks',
  },
  merge_tribes: {
    next: 'merge · now click a person of the other tribe',
    build: (a, b) => ({ cmd: 'merge_tribes', ax: a.x, ay: a.y, bx: b.x, by: b.y }),
    done: 'merged · the second tribe joined the first',
    failed: 'merge · click two people of different tribes, close to the clicks',
  },
}
