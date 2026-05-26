import type { WorldState, GridState, OrganismState, AnimalState } from '../types'
import {
  type IncomingWorldFrame,
  type ExpandedOrgDelta,
  applyGridWire,
  expandOrgsSoa,
  EMPTY_HISTORY,
} from './wire'

function mergeDefined<T extends object>(target: T, src: Partial<T>): T {
  let changed = false
  const tgt = target as Record<string, unknown>
  for (const k in src) {
    const v = (src as Record<string, unknown>)[k]
    if (v === null || v === undefined) continue
    if (tgt[k] !== v) {
      changed = true
      break
    }
  }
  if (!changed) return target
  const out = { ...target } as Record<string, unknown>
  for (const k in src) {
    const v = (src as Record<string, unknown>)[k]
    if (v !== null && v !== undefined) out[k] = v
  }
  return out as T
}

function shallowEqRecord<V>(a: Record<string, V> | undefined, b: Record<string, V> | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const ka = Object.keys(a),
    kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of ka) if (a[k] !== b[k]) return false
  return true
}

function reuseIfEqual<T extends Record<string, V> | undefined, V>(incoming: T, cached: T): T {
  return shallowEqRecord(incoming as Record<string, V> | undefined, cached as Record<string, V> | undefined)
    ? cached
    : incoming
}

function reuseArrayIfShallowEqual<T>(incoming: T[] | undefined, cached: T[] | undefined): T[] | undefined {
  if (incoming === cached) return cached
  if (!incoming || !cached) return incoming
  if (incoming.length !== cached.length) return incoming
  for (let i = 0; i < incoming.length; i++) if (incoming[i] !== cached[i]) return incoming
  return cached
}

export interface MergeCaches {
  organisms: Map<string, OrganismState>
  animals: Map<number, AnimalState>
  grid: GridState | null
  prevWorld: WorldState | null
}

export interface MergeResult {
  next: WorldState
  grid: GridState
}

export function mergeFrame(parsed: IncomingWorldFrame, caches: MergeCaches): MergeResult {
  const grid = applyGridWire(parsed.grid, caches.grid)

  // parsed.organisms is the full AoS (cold + hot fields). When absent,
  // parsed.organisms_hot is the SoA delta - only hot fields. The SoA
  // type tracks this honestly via ExpandedOrgDelta = Partial<OrganismState>
  // so downstream code can't accidentally read a cold field off a
  // SoA-only record.
  const fullFrameOrgs: OrganismState[] = parsed.organisms ?? []
  const deltaFrameOrgs: ExpandedOrgDelta[] = parsed.organisms_hot ? expandOrgsSoa(parsed.organisms_hot) : []

  if (parsed.organisms_complete && fullFrameOrgs.length > 0) {
    const next = new Map<string, OrganismState>()
    for (const org of fullFrameOrgs) {
      const existing = caches.organisms.get(org.id)
      next.set(org.id, existing ? mergeDefined(existing, org) : org)
    }
    caches.organisms = next
  } else {
    // Deltas (SoA) only merge onto an existing cache entry - a brand-
    // new id appearing in a delta would be missing cold fields (name,
    // lineage_id, traits) so we drop it; the next full frame will
    // include it as AoS and seed the cache properly.
    for (const org of deltaFrameOrgs) {
      const existing = caches.organisms.get(org.id)
      if (existing) {
        caches.organisms.set(org.id, mergeDefined(existing, org as Partial<OrganismState>))
      }
    }
    // Late-arriving cold fields can still come via a non-SoA full
    // frame in the same parsed payload (very rare, but legal).
    for (const org of fullFrameOrgs) {
      const existing = caches.organisms.get(org.id)
      caches.organisms.set(org.id, existing ? mergeDefined(existing, org) : org)
    }
  }

  if (parsed.animals_complete) {
    caches.animals = new Map(parsed.animals.map((a) => [a.id, a]))
  } else {
    for (const animal of parsed.animals) {
      const existing = caches.animals.get(animal.id)
      caches.animals.set(animal.id, existing ? mergeDefined(existing, animal) : animal)
    }
  }

  // Build the viewport list from whichever stream populated this frame.
  // Always resolve through the cache so cold fields (name, lineage_id,
  // traits) are present.
  const viewportSource: { id: string }[] =
    fullFrameOrgs.length > 0 ? (fullFrameOrgs as { id: string }[]) : (deltaFrameOrgs as { id: string }[])
  const viewportOrgs: OrganismState[] = []
  for (const o of viewportSource) {
    const cached = caches.organisms.get(o.id)
    if (cached) viewportOrgs.push(cached)
  }
  const viewportAnimals = parsed.animals.map((a) => caches.animals.get(a.id) ?? a)
  const base = caches.prevWorld

  const incomingLineageNames = parsed.lineage_names ?? base?.lineage_names
  const incomingSexWords = parsed.sex_words ?? base?.sex_words

  const next: WorldState = {
    frame_id: parsed.frame_id,
    server_sent_at_ms: parsed.server_sent_at_ms,
    frame_kind: parsed.frame_kind,
    tick: parsed.tick,
    grid,
    events: reuseArrayIfShallowEqual(parsed.events ?? base?.events ?? [], base?.events) ?? [],
    is_day: parsed.is_day ?? base?.is_day ?? true,
    day_progress: parsed.day_progress ?? base?.day_progress ?? 0,
    season: parsed.season ?? base?.season ?? 'equilibrium',
    season_progress: parsed.season_progress ?? base?.season_progress ?? 0,
    drought: parsed.drought,
    weather: parsed.weather,
    history: parsed.history ?? base?.history ?? EMPTY_HISTORY,
    story_history: parsed.story_history ?? base?.story_history ?? [],
    pop_history: parsed.pop_history ?? base?.pop_history ?? [],
    tribal_relations: parsed.tribal_relations ?? base?.tribal_relations ?? [],
    lineage_sizes: parsed.lineage_sizes ?? base?.lineage_sizes ?? [],
    lineage_names: reuseIfEqual(incomingLineageNames, base?.lineage_names),
    lineage_centroid_history: parsed.lineage_centroid_history ?? base?.lineage_centroid_history,
    lineage_homes: parsed.lineage_homes ?? base?.lineage_homes,
    current_era: parsed.current_era ?? base?.current_era,
    sex_words: reuseArrayIfShallowEqual(
      incomingSexWords as string[] | undefined,
      base?.sex_words as string[] | undefined,
    ) as [string, string] | undefined,
    // Materialise the org / animal arrays from the cache, then reuse
    // the previous frame's array reference when membership *and*
    // identities are unchanged. This is the key to keeping selectors
    // like `s.world?.organisms` from re-firing every tick - zustand
    // selectors short-circuit on Object.is(prev, next).
    organisms: reuseArrayIfShallowEqual(Array.from(caches.organisms.values()), base?.organisms) ?? [],
    viewport_organisms: viewportOrgs,
    organisms_complete: parsed.organisms_complete,
    animals: reuseArrayIfShallowEqual(Array.from(caches.animals.values()), base?.animals) ?? [],
    viewport_animals: viewportAnimals,
    animals_complete: parsed.animals_complete,
    buildings: parsed.buildings ?? base?.buildings,
    religions: parsed.religions ?? base?.religions,
    books: parsed.books ?? base?.books,
    headlines: parsed.headlines ?? base?.headlines,
    battles: parsed.battles ?? base?.battles,
    treaties: parsed.treaties ?? base?.treaties,
    farms: parsed.farms ?? base?.farms,
    vehicles: parsed.vehicles ?? base?.vehicles,
    festivals: parsed.festivals ?? base?.festivals,
    lineage_eras: (parsed.lineage_eras as Record<string, string> | undefined) ?? base?.lineage_eras,
    lineage_currencies: parsed.lineage_currencies ?? base?.lineage_currencies,
    active_outbreaks: parsed.active_outbreaks ?? base?.active_outbreaks,
    cosmos: parsed.cosmos ?? base?.cosmos,
  }

  return { next, grid }
}
