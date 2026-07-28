import { Result, ok, err } from 'neverthrow'
import { decode as msgpackDecode } from '@msgpack/msgpack'
import { gunzipSync } from 'fflate'
import type { WorldState, GridState, GridWire, OrganismState, AnimalState } from '../types'

export type ParseError = { kind: 'json'; message: string } | { kind: 'schema'; issues: string[] }

export interface OrgsHotSoa {
  ids: string[]
  xs: number[]
  ys: number[]
  vxs: number[]
  vys: number[]
  target_xs?: number[]
  target_ys?: number[]
  energies: number[]
  hydrations: number[]
  healths: number[]
  // ages was dropped from delta payloads - increments by 1 per tick
  // are pure waste over the wire. Client preserves the value from the
  // last full frame in the merge layer.
  ages?: number[]
  // alives is gone from deltas - server already filters to alive
  // before push, so every entry was true. Client merge keeps the
  // cached alive flag.
  alives?: boolean[]
  // Sparse: [index into ids, thought string]. Only orgs whose
  // thought changed since the last delta. Legacy server can still
  // send a dense `string[]`; we accept both.
  thoughts: Array<[number, string]> | string[]
  infections: number[]
  fear_levels: number[]
  carryings: number[]
  carrying_types: number[]
  pregnants: boolean[]
  // Sparse: [index, partner_id / attracted_to]. Absent → unset.
  // Legacy server can still send dense `(string | null)[]`.
  partner_ids: Array<[number, string]> | (string | null)[]
  attracted_tos: Array<[number, string]> | (string | null)[]
}

export type IncomingWorldFrame = Pick<
  WorldState,
  | 'frame_id'
  | 'server_sent_at_ms'
  | 'frame_kind'
  | 'tick'
  | 'is_day'
  | 'day_progress'
  | 'season'
  | 'season_progress'
  | 'drought'
  | 'weather'
> & {
  grid: GridWire
  organisms?: OrganismState[]
  organisms_hot?: OrgsHotSoa
  organisms_complete: boolean
  animals: AnimalState[]
  animals_complete: boolean
  events?: WorldState['events']
  history?: WorldState['history']
  story_history?: WorldState['story_history']
  pop_history?: WorldState['pop_history']
  tribal_relations?: WorldState['tribal_relations']
  lineage_sizes?: WorldState['lineage_sizes']
  lineage_names?: WorldState['lineage_names']
  lineage_centroid_history?: WorldState['lineage_centroid_history']
  lineage_homes?: WorldState['lineage_homes']
  current_era?: WorldState['current_era']
  featured_org_id?: WorldState['featured_org_id']
  sex_words?: WorldState['sex_words']
  buildings?: WorldState['buildings']
  religions?: WorldState['religions']
  books?: WorldState['books']
  headlines?: WorldState['headlines']
  battles?: WorldState['battles']
  treaties?: WorldState['treaties']
  farms?: WorldState['farms']
  settlements?: WorldState['settlements']
  vehicles?: WorldState['vehicles']
  festivals?: WorldState['festivals']
  governments?: unknown
  artworks?: unknown
  lineage_eras?: unknown
  lineage_strategies?: WorldState['lineage_strategies']
  lineage_era_progress?: WorldState['lineage_era_progress']
  lineage_currencies?: WorldState['lineage_currencies']
  active_outbreaks?: WorldState['active_outbreaks']
  cosmos?: WorldState['cosmos']
  population_limit?: WorldState['population_limit']
}

export async function fetchSnapshotWithProgress(
  url: string,
  signal?: AbortSignal,
): Promise<ArrayBuffer | null> {
  let resp: Response
  try {
    resp = await fetch(url, { cache: 'no-store', signal })
  } catch {
    return null
  }
  if (!resp.ok || !resp.body) return null

  const lenHeader = resp.headers.get('content-length')
  const total = lenHeader ? parseInt(lenHeader, 10) : null
  const reader = resp.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  const emit = () =>
    window.dispatchEvent(new CustomEvent('thb-snapshot-progress', { detail: { loaded, total } }))
  emit()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        loaded += value.byteLength
        emit()
      }
    }
  } catch {
    return null
  }
  const out = new Uint8Array(loaded)
  let pos = 0
  for (const c of chunks) {
    out.set(c, pos)
    pos += c.byteLength
  }
  return out.buffer
}

/**
 * SoA frames carry only the per-tick "hot" fields. The cold fields
 * (name, lineage_id, traits, etc.) come from a periodic AoS full
 * snapshot and live in the cache. The merge step replaces the
 * `as OrganismState` lie with a typed Partial that mergeDefined
 * unions onto the cached entry.
 *
 * Returning Partial<OrganismState> & {id: string} also surfaces a
 * real compile-time signal if a downstream consumer ever tries to
 * read a cold field directly off an SoA-expanded record without
 * going through the cache.
 */
export type ExpandedOrgDelta = Partial<OrganismState> & { id: string }

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

export function expandOrgsSoa(soa: OrgsHotSoa): ExpandedOrgDelta[] {
  const n = soa.ids.length
  const out: ExpandedOrgDelta[] = new Array(n)
  const hasAges = Array.isArray(soa.ages)
  const hasAlives = Array.isArray(soa.alives)

  // Pre-explode sparse-or-dense string-ish fields into per-index
  // lookup tables. Three legal shapes per field:
  //   - sparse  `Array<[idx, value]>` (default - only changed entries)
  //   - dense   `(string | null)[]` of length n (legacy server)
  //   - missing `undefined`           (no changes this frame at all)
  // The missing case was crashing the decoder because the dense
  // fallback did `(undefined as string[])[i]` which throws on the
  // very first iteration. Every WS delta then dropped, the animal
  // cache never advanced, and 2D animals appeared frozen / invisible
  // while orgs (already seeded from the snapshot) kept rendering.
  const sparseThoughts = isSparseStringArray(soa.thoughts) ? soa.thoughts : null
  const sparsePartners = isSparseStringArray(soa.partner_ids) ? soa.partner_ids : null
  const sparseAttracted = isSparseStringArray(soa.attracted_tos) ? soa.attracted_tos : null
  const thoughtAt: (string | undefined)[] = new Array(n)
  const partnerAt: (string | undefined)[] = new Array(n)
  const attractedAt: (string | undefined)[] = new Array(n)
  if (sparseThoughts) {
    for (const [i, s] of sparseThoughts) thoughtAt[i] = s
  } else if (Array.isArray(soa.thoughts)) {
    const dense = soa.thoughts as string[]
    for (let i = 0; i < n; i++) thoughtAt[i] = dense[i]
  }
  if (sparsePartners) {
    for (const [i, s] of sparsePartners) partnerAt[i] = s
  } else if (Array.isArray(soa.partner_ids)) {
    const dense = soa.partner_ids as (string | null)[]
    for (let i = 0; i < n; i++) partnerAt[i] = dense[i] ?? undefined
  }
  if (sparseAttracted) {
    for (const [i, s] of sparseAttracted) attractedAt[i] = s
  } else if (Array.isArray(soa.attracted_tos)) {
    const dense = soa.attracted_tos as (string | null)[]
    for (let i = 0; i < n; i++) attractedAt[i] = dense[i] ?? undefined
  }

  // Each numeric SoA field is also optional now - the server omits
  // any array whose values didn't change this frame. Capture
  // presence flags up front so the hot loop can branch cheaply on
  // local booleans instead of doing `Array.isArray` n times.
  const hasXs = Array.isArray(soa.xs)
  const hasYs = Array.isArray(soa.ys)
  const hasVxs = Array.isArray(soa.vxs)
  const hasVys = Array.isArray(soa.vys)
  const hasTargetXs = Array.isArray(soa.target_xs)
  const hasTargetYs = Array.isArray(soa.target_ys)
  const hasEnergies = Array.isArray(soa.energies)
  const hasHydrs = Array.isArray(soa.hydrations)
  const hasHealths = Array.isArray(soa.healths)
  const hasInf = Array.isArray(soa.infections)
  const hasFear = Array.isArray(soa.fear_levels)
  const hasCarrying = Array.isArray(soa.carryings)
  const hasCarryT = Array.isArray(soa.carrying_types)
  const hasPreg = Array.isArray(soa.pregnants)

  for (let i = 0; i < n; i++) {
    // Partial<OrganismState> means every field is optional, so we
    // can build the entry incrementally and skip any SoA column the
    // server dropped this frame. The cache merge in mergeFrame
    // preserves the prior value for omitted fields, which is exactly
    // the no-change semantic the wire intends.
    const entry: ExpandedOrgDelta = { id: soa.ids[i] }
    if (hasXs) entry.x = soa.xs![i] / 10
    if (hasYs) entry.y = soa.ys![i] / 10
    if (hasVxs) entry.vx = soa.vxs![i] / 10
    if (hasVys) entry.vy = soa.vys![i] / 10
    if (hasTargetXs) entry.target_x = soa.target_xs![i] !== -32768 ? soa.target_xs![i] : undefined
    if (hasTargetYs) entry.target_y = soa.target_ys![i] !== -32768 ? soa.target_ys![i] : undefined
    if (hasEnergies) entry.energy = soa.energies![i] / 100
    if (hasHydrs) entry.hydration = soa.hydrations![i] / 100
    if (hasHealths) entry.health = soa.healths![i] / 100
    if (hasInf) entry.infection = soa.infections![i] / 100
    if (hasFear) entry.fear_level = soa.fear_levels![i] / 100
    if (hasCarrying) entry.carrying = soa.carryings![i]
    if (hasCarryT) entry.carrying_type = soa.carrying_types![i]
    if (hasPreg) entry.pregnant = soa.pregnants![i]
    if (partnerAt[i] !== undefined) entry.partner_id = partnerAt[i]
    if (attractedAt[i] !== undefined) entry.attracted_to = attractedAt[i]
    // `alive` dropped from deltas (server filters to alive on push);
    // when present (legacy server) honour it. Cached value persists
    // otherwise - see merge.ts.
    if (hasAlives) entry.alive = soa.alives![i]
    // `age` dropped from deltas; same legacy-honor pattern.
    if (hasAges) entry.age = soa.ages![i]
    // `thought` is sparse - only assign when this org had a change.
    if (thoughtAt[i] !== undefined) entry.thought = thoughtAt[i]
    out[i] = entry
  }
  return out
}

export function parseWorldFrame(
  raw: ArrayBuffer | Uint8Array | string,
): Result<IncomingWorldFrame, ParseError> {
  let decoded: unknown
  try {
    if (typeof raw === 'string') {
      decoded = JSON.parse(raw)
    } else {
      let bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
      if (bytes.length > 0 && bytes[0] === 0) {
        bytes = bytes.subarray(1)
      } else if (bytes.length > 0 && bytes[0] === 1) {
        bytes = gunzipSync(bytes.subarray(1))
      }
      decoded = msgpackDecode(bytes)
    }
  } catch (e) {
    return err({ kind: 'json', message: e instanceof Error ? e.message : String(e) })
  }
  if (!decoded || typeof decoded !== 'object') {
    return err({ kind: 'schema', issues: ['root is not an object'] })
  }
  const d = decoded as Record<string, unknown>
  // Boundary validation: walk every field the renderer reads off the
  // frame and surface a real schema error instead of letting a
  // malformed payload blow up deep inside applyGridWire or
  // expandOrgsSoa. Each issue is collected so a single bad frame
  // tells us everything wrong with it.
  const issues: string[] = []
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  const isStr = (v: unknown): v is string => typeof v === 'string'
  const isBool = (v: unknown): v is boolean => typeof v === 'boolean'

  if (!isNum(d.frame_id)) issues.push('frame_id is not a finite number')
  if (!isNum(d.tick)) issues.push('tick is not a finite number')
  if (!isBool(d.organisms_complete)) issues.push('organisms_complete is not a boolean')
  if (!isBool(d.animals_complete)) issues.push('animals_complete is not a boolean')
  if (!Array.isArray(d.animals)) issues.push('animals is not an array')
  if (d.grid == null || typeof d.grid !== 'object') {
    issues.push('grid is not an object')
  } else {
    const g = d.grid as Record<string, unknown>
    if (!isNum(g.width)) issues.push('grid.width is not a number')
    if (!isNum(g.height)) issues.push('grid.height is not a number')
    if (!Array.isArray(g.fire)) issues.push('grid.fire is not an array')
    if (!Array.isArray(g.structure)) issues.push('grid.structure is not an array')
  }
  if (d.weather == null || typeof d.weather !== 'object') {
    issues.push('weather is not an object')
  } else {
    const w = d.weather as Record<string, unknown>
    if (!isStr(w.kind)) issues.push('weather.kind is not a string')
    if (!isNum(w.intensity)) issues.push('weather.intensity is not a number')
  }
  if (d.season !== undefined && !isStr(d.season)) issues.push('season is not a string')
  if (d.is_day !== undefined && !isBool(d.is_day)) issues.push('is_day is not a boolean')
  if (d.day_progress !== undefined && !isNum(d.day_progress)) issues.push('day_progress is not a number')
  if (d.season_progress !== undefined && !isNum(d.season_progress))
    issues.push('season_progress is not a number')

  if (issues.length > 0) {
    return err({ kind: 'schema', issues })
  }
  return ok(decoded as IncomingWorldFrame)
}

function take2D(existing: number[][] | undefined, h: number, w: number, fill: number): number[][] {
  if (existing && existing.length === h && existing[0]?.length === w) {
    for (let r = 0; r < h; r++) {
      const row = existing[r]
      for (let c = 0; c < w; c++) row[c] = fill
    }
    return existing
  }
  const out = new Array<number[]>(h)
  for (let r = 0; r < h; r++) out[r] = new Array(w).fill(fill)
  return out
}

export function applyGridWire(wire: GridWire, cache: GridState | null): GridState {
  const w = wire.width
  const h = wire.height

  const fire = take2D(cache?.fire_intensity, h, w, 0)
  for (const [row, col, v] of wire.fire) {
    if (row < h && col < w) fire[row][col] = v / 1000
  }

  const structure = take2D(cache?.structure, h, w, 0)
  for (const [row, col, v] of wire.structure) {
    if (row < h && col < w) structure[row][col] = v / 100
  }

  let food_trail = cache?.food_trail
  let water_trail = cache?.water_trail
  let path_trail = cache?.path_trail
  if (wire.trails) {
    food_trail = take2D(food_trail, h, w, 0)
    water_trail = take2D(water_trail, h, w, 0)
    path_trail = take2D(path_trail, h, w, 0)
    for (const [row, col, f, wv, p] of wire.trails) {
      if (row < h && col < w) {
        food_trail[row][col] = f / 100
        water_trail[row][col] = wv / 100
        path_trail[row][col] = p / 100
      }
    }
  }

  let fertility = cache?.fertility
  if (wire.fertility_dense && wire.fertility_dense.length >= w * h) {
    fertility = take2D(fertility, h, w, 0.4)
    const src = wire.fertility_dense
    for (let row = 0; row < h; row++) {
      const base = row * w
      const frow = fertility[row]
      for (let col = 0; col < w; col++) {
        frow[col] = src[base + col] / 100
      }
    }
  } else if (wire.fertility) {
    fertility = take2D(fertility, h, w, 0.4)
    for (const [row, col, v] of wire.fertility) {
      if (row < h && col < w) fertility[row][col] = v / 100
    }
  }

  let hazard = cache?.hazard
  if (wire.hazard) {
    hazard = take2D(hazard, h, w, 0)
    for (const [row, col, v] of wire.hazard) {
      if (row < h && col < w) hazard[row][col] = v / 100
    }
  }

  return {
    width: wire.width,
    height: wire.height,
    origin_x: wire.origin_x,
    origin_y: wire.origin_y,
    tiles: wire.tiles ?? cache?.tiles ?? [],
    biomes: wire.biomes ?? cache?.biomes,
    depth_map: wire.depth_map ?? cache?.depth_map,
    fire_intensity: fire,
    structure,
    food_trail,
    water_trail,
    path_trail,
    fertility,
    hazard,
  }
}

export const EMPTY_HISTORY: WorldState['history'] = {
  births: 0,
  deaths_old_age: 0,
  deaths_starvation: 0,
  deaths_dehydration: 0,
  deaths_sickness: 0,
  deaths_combat: 0,
  sickness_events: 0,
  alliances_formed: 0,
  challenges_total: 0,
  gifts_total: 0,
  droughts: 0,
  outbreaks: 0,
  era_history: [],
}
