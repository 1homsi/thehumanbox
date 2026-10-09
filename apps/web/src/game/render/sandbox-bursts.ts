import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Short-lived pixel effects drawn over the world where a god tool lands, so
 * using a tool feels like something happened even before the simulation's
 * next frame shows the result. Effects are screen-space DOM, which keeps
 * them independent of the GPU or canvas renderer underneath.
 */
export type BurstKind =
  | 'bolt'
  | 'meteor'
  | 'heal'
  | 'bless'
  | 'inspire'
  | 'quake'
  | 'war'
  | 'peace'
  | 'spawn'
  | 'fire'
  | 'plague'
  | 'paint'
  | 'grow'
  | 'water'
  | 'blight'
  | 'frost'

export interface Burst {
  id: number
  kind: BurstKind
  /** Screen position inside the world container, in CSS pixels. */
  x: number
  y: number
  /** Brush radius in CSS pixels at the current zoom. */
  r: number
  /** Jagged bolt path from the top of the view to the strike point. */
  path?: string
}

const LIFETIME_MS: Record<BurstKind, number> = {
  bolt: 650,
  meteor: 900,
  bless: 1000,
  inspire: 1000,
  quake: 900,
  war: 900,
  peace: 900,
  heal: 900,
  spawn: 800,
  fire: 700,
  plague: 900,
  paint: 450,
  grow: 1000,
  water: 900,
  blight: 900,
  frost: 1000,
}

/** Which effect a sandbox tool plays, keyed by tool id. */
export function burstForTool(toolId: string | null | undefined): BurstKind | null {
  switch (toolId) {
    case 'smite':
      return 'bolt'
    case 'heal':
    case 'heal_one':
      return 'heal'
    case 'spawn1':
    case 'spawn5':
    case 'family':
    case 'teleport':
    case 'follow':
    case 'gift_food':
    case 'gift_tool':
    case 'deer':
    case 'rabbit':
    case 'boar':
    case 'wolf':
    case 'bird':
    case 'fish':
    case 'bear':
    case 'sheep':
    case 'cow':
    case 'horse':
    case 'chicken':
    case 'fox':
    case 'cat':
    case 'penguin':
    case 'camel':
    case 'frog':
    case 'whale':
    case 'dog':
    case 'zombie':
    case 'demon':
    case 'dragon':
    case 'alien':
    case 'ufo':
      return 'spawn'
    case 'cure':
    case 'love':
    case 'marry':
    case 'name':
      return 'heal'
    case 'tame':
      return 'peace'
    case 'volcano':
    case 'meteor_shower':
      return 'meteor'
    case 'harvest':
    case 'sunshine':
    case 'plant_berry':
    case 'plant_mushroom':
    case 'plant_oak':
    case 'plant_pine':
    case 'plant_palm':
    case 'restore':
      return 'grow'
    case 'arm':
    case 'courage':
      return 'inspire'
    case 'bounty':
    case 'ward':
    case 'revive':
    case 'long_life':
      return 'bless'
    case 'douse':
    case 'flood':
    case 'tsunami':
      return 'water'
    case 'banish':
    case 'thunder':
      return 'bolt'
    case 'frenzy':
      return 'war'
    case 'blight':
    case 'locusts':
      return 'blight'
    case 'blizzard':
    case 'hail':
      return 'frost'
    case 'mutate':
      return 'bless'
    case 'cure_tribe':
      return 'heal'
    case 'guardian':
      return 'bless'
    case 'clear_region':
      return 'quake'
    case 'rain_patch':
      return 'water'
    case 'merge_tribes':
      return 'peace'
    case 'split_tribe':
      return 'spawn'
    case 'teach_tribe':
      return 'inspire'
    case 'curse':
      return 'plague'
    case 'nuke':
    case 'comet':
      return 'meteor'
    case 'fire':
    case 'wildfire':
      return 'fire'
    case 'meteor':
      return 'meteor'
    case 'bless':
      return 'bless'
    case 'inspire':
    case 'leader':
      return 'inspire'
    case 'earthquake':
    case 'tornado':
    case 'demolish':
      return 'quake'
    case 'road':
    case 'bridge':
    case 'road_erase':
      return 'paint'
    case 'repair':
    case 'place_house':
    case 'place_library':
      return 'bless'
    case 'war':
      return 'war'
    case 'peace':
      return 'peace'
    case 'poison':
      return 'plague'
    case 'grass':
    case 'water':
    case 'rock':
    case 'sand':
    case 'snow':
    case 'food':
    case 'drink':
    case 'shelter':
    case 'campfire':
      return 'paint'
    case 'biome_grassland':
    case 'biome_forest':
    case 'biome_jungle':
    case 'biome_savanna':
    case 'biome_desert':
    case 'biome_badlands':
    case 'biome_wetland':
    case 'biome_tundra':
    case 'biome_taiga':
    case 'plant_crop':
    case 'plant_orchard':
    case 'plant_sapling':
    case 'plant_flowers':
      return 'grow'
    default:
      return null
  }
}

/** Zigzag from above the view down to (x, y), snapped to a 4px pixel grid. */
export function boltPath(x: number, y: number, rand: () => number = Math.random): string {
  const snap = (n: number) => Math.round(n / 4) * 4
  const steps = Math.max(4, Math.round(y / 36))
  const points: string[] = [`${snap(x + (rand() - 0.5) * 60)},-8`]
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const drift = (rand() - 0.5) * 44 * (1 - t)
    points.push(`${snap(x + drift)},${snap(y * t)}`)
  }
  points.push(`${snap(x)},${snap(y)}`)
  return points.join(' ')
}

export function useSandboxBursts() {
  const [bursts, setBursts] = useState<Burst[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Set<number>())

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const t of pending) window.clearTimeout(t)
      pending.clear()
    }
  }, [])

  const spawn = useCallback((kind: BurstKind, x: number, y: number, r: number) => {
    const id = nextId.current++
    const burst: Burst = { id, kind, x, y, r, path: kind === 'bolt' ? boltPath(x, y) : undefined }
    // Cap concurrent effects so rapid clicking never piles up DOM.
    setBursts((prev) => [...prev.slice(-11), burst])
    const timer = window.setTimeout(() => {
      timers.current.delete(timer)
      setBursts((prev) => prev.filter((b) => b.id !== id))
    }, LIFETIME_MS[kind])
    timers.current.add(timer)
  }, [])

  return { bursts, spawn }
}
