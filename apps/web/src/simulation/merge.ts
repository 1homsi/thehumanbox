import type { WorldState, GridState, OrganismState, AnimalState } from '../shared/types'
import { type IncomingWorldFrame, type OrgsHotSoa, applyGridWire, EMPTY_HISTORY } from './wire'

function mergeDefined<T extends object>(target: T, src: Partial<T>): T {
  let changed = false
  const tgt = target as Record<string, unknown>
  for (const k in src) {
    const v = (src as Record<string, unknown>)[k]
    if (v === undefined) continue
    // `null` is applied as a delete below, so it is a no-op when the key is
    // already absent. A bare `tgt[k] !== v` treated "cleared" and "never
    // set" as different, so every field the wire nulls out looked changed on
    // every frame — reallocating every organism 10x/s and defeating the
    // identity fast path the rest of this module exists to provide.
    const cur = tgt[k]
    const differs = v === null ? cur !== undefined && cur !== null : cur !== v
    if (differs) {
      changed = true
      break
    }
  }
  if (!changed) return target
  const out = { ...target } as Record<string, unknown>
  for (const k in src) {
    const v = (src as Record<string, unknown>)[k]
    if (v === undefined) continue
    // An explicit `null` is the wire's "this was cleared" signal (see
    // `wire.ts`, where a -32768 wander-target sentinel and an absent
    // partner both become null). Skipping it here — as this function
    // previously did — made the merge union-only, so a cleared
    // `partner_id` / `target_x` stayed frozen at its last non-null value
    // until the next cold frame.
    if (v === null) delete out[k]
    else out[k] = v
  }
  return out as T
}

// Detect sparse `Array<[number, string]>` vs dense `(string|null)[]`
// form of a soa field. The sparse form is `[[idx, value], …]` while
// the dense form is `[value, value, …]` (strings or nulls). Spotting
// the difference by the first element's shape is reliable for our
// schema: dense entries are strings/null, sparse entries are
// `[number, string]` tuples.
function isSparseStringArray(a: unknown): a is Array<[number, string]> {
  if (!Array.isArray(a) || a.length === 0) return false
  const first = a[0]
  return Array.isArray(first) && first.length === 2 && typeof first[0] === 'number'
}

// Pre-explodes a sparse-or-dense string-ish column into a per-index
// lookup table. Three legal shapes per field:
//   - sparse  `Array<[idx, value]>` (default - only changed entries)
//   - dense   `(string | null)[]` of length n (legacy server)
//   - missing `undefined`           (no changes this frame at all)
// The missing case once crashed the decoder (a dense fallback reading
// `(undefined as string[])[i]`), dropped every WS delta, and left the
// animal cache frozen while orgs kept rendering.
function fillStringTable(table: (string | undefined)[], col: unknown, n: number): void {
  table.length = n
  table.fill(undefined)
  if (isSparseStringArray(col)) {
    for (const [i, s] of col) table[i] = s
  } else if (Array.isArray(col)) {
    const dense = col as (string | null)[]
    for (let i = 0; i < n; i++) table[i] = dense[i] ?? undefined
  }
}

// The SoA columns of the frame being merged. Module-level and reused so a
// 3,000-person frame allocates no per-organism delta records, only the
// replacement record of an organism that actually changed.
const thoughtAt: (string | undefined)[] = []
const partnerAt: (string | undefined)[] = []
const attractedAt: (string | undefined)[] = []
let cXs: number[] | null = null
let cYs: number[] | null = null
let cVxs: number[] | null = null
let cVys: number[] | null = null
let cTargetXs: number[] | null = null
let cTargetYs: number[] | null = null
let cEnergies: number[] | null = null
let cHydrations: number[] | null = null
let cHealths: number[] | null = null
let cInfections: number[] | null = null
let cFears: number[] | null = null
let cCarryings: number[] | null = null
let cCarryTypes: number[] | null = null
let cPregnants: boolean[] | null = null
let cAges: number[] | null = null
let cAlives: boolean[] | null = null

function column<T>(a: T[] | undefined): T[] | null {
  return Array.isArray(a) ? a : null
}

function loadColumns(soa: OrgsHotSoa): void {
  const n = soa.ids.length
  fillStringTable(thoughtAt, soa.thoughts, n)
  fillStringTable(partnerAt, soa.partner_ids, n)
  fillStringTable(attractedAt, soa.attracted_tos, n)
  // Each numeric column is optional: the server omits any array whose
  // values did not change this frame, and the cached value persists.
  cXs = column(soa.xs)
  cYs = column(soa.ys)
  cVxs = column(soa.vxs)
  cVys = column(soa.vys)
  cTargetXs = column(soa.target_xs)
  cTargetYs = column(soa.target_ys)
  cEnergies = column(soa.energies)
  cHydrations = column(soa.hydrations)
  cHealths = column(soa.healths)
  cInfections = column(soa.infections)
  cFears = column(soa.fear_levels)
  cCarryings = column(soa.carryings)
  cCarryTypes = column(soa.carrying_types)
  cPregnants = column(soa.pregnants)
  // `age` and `alive` were dropped from deltas (the server only pushes
  // living organisms and age is +1 per tick); a legacy server may still
  // send them, so honour them when present.
  cAges = column(soa.ages)
  cAlives = column(soa.alives)
}

function releaseColumns(): void {
  cXs = cYs = cVxs = cVys = cTargetXs = cTargetYs = null
  cEnergies = cHydrations = cHealths = cInfections = cFears = cCarryings = cCarryTypes = null
  cPregnants = null
  cAges = null
  cAlives = null
  thoughtAt.length = partnerAt.length = attractedAt.length = 0
}

// -32768 is the server's "no destination" sentinel. It is an explicit
// `null` so the merge can apply the clear; `undefined` is "unchanged",
// which used to pin the last non-null target forever.
function targetAt(col: number[], i: number): number | null {
  return col[i] !== -32768 ? col[i] : null
}

// `null` clears, so it only counts as a change when the field is set.
function targetDiffers(cur: number | null | undefined, v: number | null): boolean {
  return v === null ? cur !== undefined && cur !== null : cur !== v
}

function orgDiffers(o: OrganismState, i: number): boolean {
  if (cXs && o.x !== cXs[i] / 10) return true
  if (cYs && o.y !== cYs[i] / 10) return true
  if (cVxs && o.vx !== cVxs[i] / 10) return true
  if (cVys && o.vy !== cVys[i] / 10) return true
  if (cTargetXs && targetDiffers(o.target_x, targetAt(cTargetXs, i))) return true
  if (cTargetYs && targetDiffers(o.target_y, targetAt(cTargetYs, i))) return true
  if (cEnergies && o.energy !== cEnergies[i] / 100) return true
  if (cHydrations && o.hydration !== cHydrations[i] / 100) return true
  if (cHealths && o.health !== cHealths[i] / 100) return true
  if (cInfections && o.infection !== cInfections[i] / 100) return true
  if (cFears && o.fear_level !== cFears[i] / 100) return true
  if (cCarryings && o.carrying !== cCarryings[i]) return true
  if (cCarryTypes && o.carrying_type !== cCarryTypes[i]) return true
  if (cPregnants && o.pregnant !== cPregnants[i]) return true
  if (partnerAt[i] !== undefined && o.partner_id !== partnerAt[i]) return true
  if (attractedAt[i] !== undefined && o.attracted_to !== attractedAt[i]) return true
  if (cAlives && o.alive !== cAlives[i]) return true
  if (cAges && o.age !== cAges[i]) return true
  if (thoughtAt[i] !== undefined && o.thought !== thoughtAt[i]) return true
  return false
}

function applyOrg(out: OrganismState, i: number): void {
  const o = out as unknown as Record<string, unknown>
  if (cXs) out.x = cXs[i] / 10
  if (cYs) out.y = cYs[i] / 10
  if (cVxs) out.vx = cVxs[i] / 10
  if (cVys) out.vy = cVys[i] / 10
  if (cTargetXs) {
    const v = targetAt(cTargetXs, i)
    if (v === null) delete o.target_x
    else out.target_x = v
  }
  if (cTargetYs) {
    const v = targetAt(cTargetYs, i)
    if (v === null) delete o.target_y
    else out.target_y = v
  }
  if (cEnergies) out.energy = cEnergies[i] / 100
  if (cHydrations) out.hydration = cHydrations[i] / 100
  if (cHealths) out.health = cHealths[i] / 100
  if (cInfections) out.infection = cInfections[i] / 100
  if (cFears) out.fear_level = cFears[i] / 100
  if (cCarryings) out.carrying = cCarryings[i]
  if (cCarryTypes) out.carrying_type = cCarryTypes[i]
  if (cPregnants) out.pregnant = cPregnants[i]
  if (partnerAt[i] !== undefined) out.partner_id = partnerAt[i]
  if (attractedAt[i] !== undefined) out.attracted_to = attractedAt[i]
  if (cAlives) out.alive = cAlives[i]
  if (cAges) out.age = cAges[i]
  if (thoughtAt[i] !== undefined) out.thought = thoughtAt[i]
}

/**
 * Merges the SoA delta straight onto the cached records, with no
 * intermediate per-organism delta object. Only a record whose hot fields
 * changed is replaced (a copy; identity is the change signal downstream).
 * Deltas never create records: a brand-new id would be missing its cold
 * fields (name, lineage_id, traits), so it is dropped and the next full
 * frame seeds it as AoS. `viewport` receives the resulting cached record
 * of every delta organism that has one.
 */
function mergeOrgsSoa(soa: OrgsHotSoa, cache: Map<string, OrganismState>, viewport: OrganismState[]): void {
  loadColumns(soa)
  const ids = soa.ids
  for (let i = 0; i < ids.length; i++) {
    const existing = cache.get(ids[i])
    if (!existing) continue
    if (orgDiffers(existing, i)) {
      const out = { ...existing }
      applyOrg(out, i)
      cache.set(ids[i], out)
      viewport.push(out)
    } else {
      viewport.push(existing)
    }
  }
  releaseColumns()
}

// `Array.from(map.values())`, except the previous frame's array is returned
// untouched (and nothing is allocated) while the membership and every
// record's identity are unchanged.
function valuesReusing<T>(map: Map<unknown, T>, prev: T[] | undefined): T[] {
  if (prev && prev.length === map.size) {
    let i = 0
    for (const v of map.values()) if (prev[i++] !== v) return Array.from(map.values())
    return prev
  }
  return Array.from(map.values())
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
  // parsed.organisms_hot is the SoA delta - only hot fields, merged
  // straight onto the cache by mergeOrgsSoa.
  const fullFrameOrgs: OrganismState[] = parsed.organisms ?? []
  const deltaOrgs: OrganismState[] = []

  // An `organisms_complete` frame is authoritative, including when it is
  // empty (total extinction). The extra `length > 0` guard meant an empty
  // complete frame fell through to the delta branch and left the whole
  // organism cache — and therefore `world.organisms` and the store's
  // `byId` — frozen on the last-known roster. Compare the animals branch
  // below, which rebuilds unconditionally.
  if (parsed.organisms_complete) {
    const next = new Map<string, OrganismState>()
    for (const org of fullFrameOrgs) {
      const existing = caches.organisms.get(org.id)
      next.set(org.id, existing ? mergeDefined(existing, org) : org)
    }
    caches.organisms = next
  } else {
    if (parsed.organisms_hot) mergeOrgsSoa(parsed.organisms_hot, caches.organisms, deltaOrgs)
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
  let viewportOrgs: OrganismState[] = deltaOrgs
  if (fullFrameOrgs.length > 0) {
    viewportOrgs = []
    for (const o of fullFrameOrgs) {
      const cached = caches.organisms.get(o.id)
      if (cached) viewportOrgs.push(cached)
    }
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
    population_limit: parsed.population_limit ?? base?.population_limit,
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
    lineage_words: parsed.lineage_words ?? base?.lineage_words,
    lineage_centroid_history: parsed.lineage_centroid_history ?? base?.lineage_centroid_history,
    lineage_homes: parsed.lineage_homes ?? base?.lineage_homes,
    goals: parsed.goals ?? base?.goals ?? [],
    difficulty: parsed.difficulty ?? base?.difficulty ?? 'normal',
    lost_tick: parsed.lost_tick ?? base?.lost_tick ?? null,
    current_era: parsed.current_era ?? base?.current_era,
    featured_org_id: parsed.featured_org_id ?? base?.featured_org_id,
    sex_words: reuseArrayIfShallowEqual(
      incomingSexWords as string[] | undefined,
      base?.sex_words as string[] | undefined,
    ) as [string, string] | undefined,
    territory: parsed.territory ?? base?.territory,
    // Materialise the org / animal arrays from the cache, then reuse
    // the previous frame's array reference when membership *and*
    // identities are unchanged. This is the key to keeping selectors
    // like `s.world?.organisms` from re-firing every tick - zustand
    // selectors short-circuit on Object.is(prev, next).
    organisms: valuesReusing(caches.organisms, base?.organisms),
    viewport_organisms: viewportOrgs,
    organisms_complete: parsed.organisms_complete,
    animals: valuesReusing(caches.animals, base?.animals),
    viewport_animals: viewportAnimals,
    animals_complete: parsed.animals_complete,
    buildings: parsed.buildings ?? base?.buildings,
    religions: parsed.religions ?? base?.religions,
    books: parsed.books ?? base?.books,
    headlines: parsed.headlines ?? base?.headlines,
    battles: parsed.battles ?? base?.battles,
    treaties: parsed.treaties ?? base?.treaties,
    trades: parsed.trades ?? base?.trades,
    trade_routes: parsed.trade_routes ?? base?.trade_routes,
    caravans: parsed.caravans ?? base?.caravans,
    land_goods: parsed.land_goods ?? base?.land_goods,
    trade_income: parsed.trade_income ?? base?.trade_income,
    trade_barter: parsed.trade_barter ?? base?.trade_barter,
    specialties: parsed.specialties ?? base?.specialties,
    governments: parsed.governments ?? base?.governments,
    artworks: parsed.artworks ?? base?.artworks,
    farms: parsed.farms ?? base?.farms,
    plantings: parsed.plantings ?? base?.plantings,
    prayers: parsed.prayers ?? base?.prayers,
    hard_winter: parsed.hard_winter ?? base?.hard_winter,
    hard_winter_ahead: parsed.hard_winter_ahead ?? base?.hard_winter_ahead,
    faith: parsed.faith ?? base?.faith,
    tribes_in_peril: parsed.tribes_in_peril ?? base?.tribes_in_peril,
    tribe_losses: parsed.tribe_losses ?? base?.tribe_losses,
    wards: parsed.wards ?? base?.wards,
    smog: parsed.smog ?? base?.smog,
    volcanoes: parsed.volcanoes ?? base?.volcanoes,
    settlements: parsed.settlements ?? base?.settlements,
    vehicles: parsed.vehicles ?? base?.vehicles,
    carcasses: parsed.carcasses ?? base?.carcasses,
    festivals: parsed.festivals ?? base?.festivals,
    lineage_eras: (parsed.lineage_eras as Record<string, string> | undefined) ?? base?.lineage_eras,
    lineage_strategies: parsed.lineage_strategies ?? base?.lineage_strategies,
    lineage_strategy_history: parsed.lineage_strategy_history ?? base?.lineage_strategy_history,
    lineage_era_progress: parsed.lineage_era_progress ?? base?.lineage_era_progress,
    lineage_currencies: parsed.lineage_currencies ?? base?.lineage_currencies,
    active_outbreaks: parsed.active_outbreaks ?? base?.active_outbreaks,
    cosmos: parsed.cosmos ?? base?.cosmos,
  }

  return { next, grid }
}
