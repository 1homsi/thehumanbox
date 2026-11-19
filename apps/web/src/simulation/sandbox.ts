import type { MessageKey } from '../i18n'
import type { ActionTarget, CountSlot } from './actions/manifest'
import { REGISTRY } from './actions/registry'

export type SandboxCommand =
  | {
      cmd: 'spawn'
      x: number
      y: number
      count?: number
      lineage?: string
      /** A point where a people already lives: the new people speak the words of the nearest person there. */
      speak_like?: [number, number]
    }
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
  | { cmd: 'outbreak'; count?: number; x?: number; y?: number; radius?: number }
  | { cmd: 'sinkhole'; x: number; y: number; radius?: number }
  | { cmd: 'black_hole'; x: number; y: number; radius?: number }
  | { cmd: 'acid_rain'; x: number; y: number; radius?: number }
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
  | { cmd: 'freeze'; x: number; y: number; radius?: number }
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
  | { cmd: 'follow'; id?: string }
  | { cmd: 'tame'; x: number; y: number; radius?: number }
  | { cmd: 'family'; x: number; y: number }
  | { cmd: 'teleport'; x: number; y: number; radius?: number }
  | { cmd: 'make_leader'; x: number; y: number; radius?: number }
  | { cmd: 'heal_one'; x: number; y: number; radius?: number }
  | { cmd: 'mutate'; x: number; y: number; radius?: number }
  | { cmd: 'curse'; x: number; y: number; radius?: number }
  | { cmd: 'teach_nearby'; x: number; y: number; radius?: number }
  | { cmd: 'set_difficulty'; level: 'calm' | 'normal' | 'harsh' }
  | { cmd: 'gift'; x: number; y: number; radius?: number; what: 'food' | 'tool' }
  | { cmd: 'time_of_day'; phase: 'dawn' | 'noon' | 'dusk' | 'midnight' }
  | { cmd: 'hail'; x: number; y: number; radius?: number }
  | { cmd: 'nuke'; x: number; y: number; radius?: number }
  | { cmd: 'eclipse' }
  | { cmd: 'rain_patch'; x: number; y: number; radius?: number }
  | { cmd: 'cure_tribe'; x: number; y: number }
  | { cmd: 'guardian'; x: number; y: number }
  | { cmd: 'aurora' }
  | { cmd: 'heat_wave' }
  | { cmd: 'bless_river'; x: number; y: number; radius?: number }
  | { cmd: 'bless_forest'; x: number; y: number; radius?: number }
  | { cmd: 'talent'; x: number; y: number; radius?: number }
  | { cmd: 'era_tribe'; x: number; y: number; era: string }
  | { cmd: 'tribe_gift'; x: number; y: number; radius?: number; what: 'food' | 'tool' }
  | { cmd: 'migrate_tribe'; x: number; y: number; radius?: number }
  | { cmd: 'trade_gift'; ax: number; ay: number; bx: number; by: number }
  | { cmd: 'clear_region'; x: number; y: number; radius?: number }
  | { cmd: 'comet'; x: number; y: number; radius?: number }
  | { cmd: 'demolish'; x: number; y: number; radius?: number }
  | { cmd: 'repair'; x: number; y: number; radius?: number }
  | { cmd: 'road'; x: number; y: number; radius?: number; kind: 'road' | 'bridge' | 'erase' }
  | { cmd: 'place_building'; x: number; y: number; kind: string }
  | { cmd: 'place_boat'; x: number; y: number }
  | { cmd: 'composite'; steps: SandboxCommand[] }
  | {
      cmd: 'guide'
      lineage: string
      strategy: LineageStrategy
      duration_ticks?: number
    }

export { commandReach, reachesArea } from './actions/registry'

export function rollRandomEvent(
  width: number,
  height: number,
  random: () => number = Math.random,
): SandboxCommand {
  const events = REGISTRY.randomEvents
  const event = events[Math.floor(random() * events.length) % events.length]
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

export type TimeControl = { control: 'pause' | 'resume' | 'speed'; mult?: number }

type SandboxOverlay =
  'density' | 'hazard' | 'fertility' | 'structures' | 'trails' | 'age' | 'threat' | 'food' | 'wealth' | 'mood'

export type SandboxViewFlag =
  'territory' | 'history' | 'names' | 'thoughts' | 'animals' | 'grid' | 'tradeRoutes'

export type SandboxViewControl =
  { control: 'overlay'; value: SandboxOverlay } | { control: 'flag'; value: SandboxViewFlag }

/** The sky effects a tool can draw over the map once it lands. */
export type SkyOverlayKind = 'eclipse' | 'aurora'

export interface SandboxTool {
  id: string
  label: string
  icon: string
  mode: 'point' | 'instant'
  target?: ActionTarget
  name?: MessageKey
  tip?: MessageKey
  description?: string
  failure?: MessageKey
  hotkey?: string
  count?: CountSlot & { text?: MessageKey }
  /** A sky effect drawn over the map for a while once the command lands (see game/render/sky-overlay.ts). */
  overlay?: SkyOverlayKind
  build?: (x: number, y: number, brush: number, count?: number) => SandboxCommand
  fire?: SandboxCommand
  time?: TimeControl
  view?: SandboxViewControl
}

export interface SandboxCategory {
  id: string
  label: string
  icon: string
  name?: MessageKey
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

export const SANDBOX_CATEGORIES: SandboxCategory[] = REGISTRY.categories

export function usesBrush(tool: SandboxTool | null | undefined): boolean {
  if (!tool?.build) return false
  return JSON.stringify(tool.build(0, 0, 0)) !== JSON.stringify(tool.build(0, 0, 4))
}

export function toolById(id: string | null): SandboxTool | undefined {
  return id === null ? undefined : REGISTRY.tools.get(id)
}

/** A tool that takes two clicks: the first picks one thing, the second the other, then the app sends the command. */
export interface PairTool {
  /** Shown while waiting for the second click: a translation key, read with t() where it is shown. */
  next: MessageKey
  build: (first: { x: number; y: number }, second: { x: number; y: number }) => SandboxCommand
  /** Translation keys for the outcome of the command. */
  done: MessageKey
  failed: MessageKey
}

export const PAIR_TOOLS: Record<string, PairTool> = REGISTRY.pairs

/**
 * Whether dragging with this tool armed should place it along the drag. Only single-place tools
 * qualify: pair tools need two clicks, and follow and name act on the person under one point.
 */
export function canPlaceAlongDrag(tool: SandboxTool | null | undefined): boolean {
  if (!tool?.build || tool.mode !== 'point') return false
  return tool.target !== 'pair' && tool.target !== 'person'
}
