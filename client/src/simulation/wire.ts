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
  territory?: WorldState['territory']
  buildings?: WorldState['buildings']
  religions?: WorldState['religions']
  books?: WorldState['books']
  headlines?: WorldState['headlines']
  battles?: WorldState['battles']
  treaties?: WorldState['treaties']
  trades?: WorldState['trades']
  trade_routes?: WorldState['trade_routes']
  caravans?: WorldState['caravans']
  farms?: WorldState['farms']
  supply_caches?: WorldState['supply_caches']
  settlements?: WorldState['settlements']
  vehicles?: WorldState['vehicles']
  festivals?: WorldState['festivals']
  governments?: WorldState['governments']
  artworks?: WorldState['artworks']
  lineage_eras?: unknown
  lineage_strategies?: WorldState['lineage_strategies']
  lineage_campaign_options?: WorldState['lineage_campaign_options']
  lineage_strategy_history?: WorldState['lineage_strategy_history']
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
  const isPoint = (v: unknown): v is [number, number] =>
    Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1])
  const validateNonNegativeNumber = (
    value: unknown,
    path: string,
    { integer = false }: { integer?: boolean } = {},
  ) => {
    if (!isNum(value) || value < 0 || (integer && !Number.isInteger(value))) {
      issues.push(`${path} is invalid`)
    }
  }

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
  if (d.supply_caches !== undefined) {
    if (!Array.isArray(d.supply_caches)) {
      issues.push('supply_caches is not an array')
    } else {
      d.supply_caches.forEach((value, index) => {
        if (value == null || typeof value !== 'object') {
          issues.push(`supply_caches[${index}] is not an object`)
          return
        }
        const cache = value as Record<string, unknown>
        if (!isNum(cache.x) || !isNum(cache.y)) issues.push(`supply_caches[${index}] has invalid position`)
        if (!isStr(cache.lineage_id)) issues.push(`supply_caches[${index}].lineage_id is not a string`)
        validateNonNegativeNumber(cache.food, `supply_caches[${index}].food`, { integer: true })
        validateNonNegativeNumber(cache.water, `supply_caches[${index}].water`, { integer: true })
        if (cache.damage !== undefined) {
          validateNonNegativeNumber(cache.damage, `supply_caches[${index}].damage`, { integer: true })
        }
        if (!isBool(cache.fishing_weir)) issues.push(`supply_caches[${index}].fishing_weir is not a boolean`)
      })
    }
  }
  if (d.lineage_strategies !== undefined) {
    if (
      d.lineage_strategies == null ||
      typeof d.lineage_strategies !== 'object' ||
      Array.isArray(d.lineage_strategies)
    ) {
      issues.push('lineage_strategies is not an object')
    } else {
      for (const [lineageId, rawStrategy] of Object.entries(
        d.lineage_strategies as Record<string, unknown>,
      )) {
        if (!rawStrategy || typeof rawStrategy !== 'object' || Array.isArray(rawStrategy)) {
          issues.push(`lineage_strategies.${lineageId} is not an object`)
          continue
        }
        const strategy = rawStrategy as Record<string, unknown>
        if (!isStr(strategy.strategy)) issues.push(`lineage_strategies.${lineageId}.strategy is not a string`)
        if (!isNum(strategy.expires_tick) || strategy.expires_tick < 0)
          issues.push(`lineage_strategies.${lineageId}.expires_tick is invalid`)
        for (const field of ['started_tick', 'progress', 'target'] as const) {
          if (strategy[field] !== undefined && (!isNum(strategy[field]) || strategy[field] < 0)) {
            issues.push(`lineage_strategies.${lineageId}.${field} is invalid`)
          }
        }
        if (strategy.completed !== undefined && !isBool(strategy.completed)) {
          issues.push(`lineage_strategies.${lineageId}.completed is not a boolean`)
        }
        if (
          strategy.completed_tick !== undefined &&
          strategy.completed_tick !== null &&
          (!isNum(strategy.completed_tick) || strategy.completed_tick < 0)
        ) {
          issues.push(`lineage_strategies.${lineageId}.completed_tick is invalid`)
        }
        if (
          strategy.status !== undefined &&
          strategy.status !== 'active' &&
          strategy.status !== 'completed'
        ) {
          issues.push(`lineage_strategies.${lineageId}.status is invalid`)
        }
      }
    }
  }
  if (d.lineage_campaign_options !== undefined) {
    const reasons = new Set([
      'lineage_not_living',
      'no_capable_hunter',
      'no_living_prey',
      'no_mobile_explorer',
      'no_adult_worker',
      'no_capable_trader',
      'no_foreign_lineage',
      'no_capable_defender',
      'unknown_strategy',
    ])
    if (
      d.lineage_campaign_options == null ||
      typeof d.lineage_campaign_options !== 'object' ||
      Array.isArray(d.lineage_campaign_options)
    ) {
      issues.push('lineage_campaign_options is not an object')
    } else {
      for (const [lineageId, rawOptions] of Object.entries(
        d.lineage_campaign_options as Record<string, unknown>,
      )) {
        if (!rawOptions || typeof rawOptions !== 'object' || Array.isArray(rawOptions)) {
          issues.push(`lineage_campaign_options.${lineageId} is not an object`)
          continue
        }
        for (const [strategyName, rawOption] of Object.entries(rawOptions)) {
          const path = `lineage_campaign_options.${lineageId}.${strategyName}`
          if (!rawOption || typeof rawOption !== 'object' || Array.isArray(rawOption)) {
            issues.push(`${path} is not an object`)
            continue
          }
          const option = rawOption as Record<string, unknown>
          if (!isBool(option.available)) issues.push(`${path}.available is not a boolean`)
          if (
            option.reason !== undefined &&
            option.reason !== null &&
            (!isStr(option.reason) || !reasons.has(option.reason))
          ) {
            issues.push(`${path}.reason is invalid`)
          }
        }
      }
    }
  }
  if (d.lineage_strategy_history !== undefined) {
    if (!Array.isArray(d.lineage_strategy_history)) {
      issues.push('lineage_strategy_history is not an array')
    } else {
      const outcomes = new Set(['completed', 'partial', 'expired', 'redirected', 'cancelled', 'failed'])
      const reasons = new Set(['deadline', 'player_redirected', 'player_cancelled', 'lineage_extinct'])
      for (const [index, rawCampaign] of d.lineage_strategy_history.entries()) {
        if (!rawCampaign || typeof rawCampaign !== 'object' || Array.isArray(rawCampaign)) {
          issues.push(`lineage_strategy_history.${index} is not an object`)
          continue
        }
        const campaign = rawCampaign as Record<string, unknown>
        if (!isStr(campaign.lineage_id))
          issues.push(`lineage_strategy_history.${index}.lineage_id is not a string`)
        if (!isStr(campaign.lineage_name))
          issues.push(`lineage_strategy_history.${index}.lineage_name is not a string`)
        if (!isStr(campaign.strategy))
          issues.push(`lineage_strategy_history.${index}.strategy is not a string`)
        if (!isStr(campaign.outcome) || !outcomes.has(campaign.outcome))
          issues.push(`lineage_strategy_history.${index}.outcome is invalid`)
        if (
          campaign.reason !== undefined &&
          campaign.reason !== null &&
          (!isStr(campaign.reason) || !reasons.has(campaign.reason))
        ) {
          issues.push(`lineage_strategy_history.${index}.reason is invalid`)
        }
        if (campaign.impact !== undefined && campaign.impact !== null && !isStr(campaign.impact)) {
          issues.push(`lineage_strategy_history.${index}.impact is invalid`)
        }
        for (const field of ['started_tick', 'ended_tick', 'progress', 'target'] as const) {
          if (!isNum(campaign[field]) || campaign[field] < 0) {
            issues.push(`lineage_strategy_history.${index}.${field} is invalid`)
          }
        }
      }
    }
  }
  if (d.trade_routes !== undefined) {
    if (!Array.isArray(d.trade_routes)) {
      issues.push('trade_routes is not an array')
    } else {
      for (const [index, rawRoute] of d.trade_routes.entries()) {
        const path = `trade_routes.${index}`
        if (!rawRoute || typeof rawRoute !== 'object' || Array.isArray(rawRoute)) {
          issues.push(`${path} is not an object`)
          continue
        }
        const route = rawRoute as Record<string, unknown>
        validateNonNegativeNumber(route.id, `${path}.id`, { integer: true })
        if (!isStr(route.lineage_a) || route.lineage_a.length === 0)
          issues.push(`${path}.lineage_a is invalid`)
        if (!isStr(route.lineage_b) || route.lineage_b.length === 0)
          issues.push(`${path}.lineage_b is invalid`)
        if (!isPoint(route.a_center)) issues.push(`${path}.a_center is invalid`)
        if (!isPoint(route.b_center)) issues.push(`${path}.b_center is invalid`)
        validateNonNegativeNumber(route.established_tick, `${path}.established_tick`, { integer: true })
        validateNonNegativeNumber(route.last_dispatch_tick, `${path}.last_dispatch_tick`, { integer: true })
        validateNonNegativeNumber(route.deliveries, `${path}.deliveries`, { integer: true })
        validateNonNegativeNumber(route.volume, `${path}.volume`)
      }
    }
  }
  if (d.caravans !== undefined) {
    if (!Array.isArray(d.caravans)) {
      issues.push('caravans is not an array')
    } else {
      for (const [index, rawCaravan] of d.caravans.entries()) {
        const path = `caravans.${index}`
        if (!rawCaravan || typeof rawCaravan !== 'object' || Array.isArray(rawCaravan)) {
          issues.push(`${path} is not an object`)
          continue
        }
        const caravan = rawCaravan as Record<string, unknown>
        validateNonNegativeNumber(caravan.id, `${path}.id`, { integer: true })
        validateNonNegativeNumber(caravan.route_id, `${path}.route_id`, { integer: true })
        if (!isStr(caravan.sender_lineage) || caravan.sender_lineage.length === 0)
          issues.push(`${path}.sender_lineage is invalid`)
        if (!isStr(caravan.receiver_lineage) || caravan.receiver_lineage.length === 0)
          issues.push(`${path}.receiver_lineage is invalid`)
        if (!isStr(caravan.sender_org_id)) issues.push(`${path}.sender_org_id is invalid`)
        if (!isStr(caravan.cargo) || caravan.cargo.length === 0) issues.push(`${path}.cargo is invalid`)
        validateNonNegativeNumber(caravan.amount, `${path}.amount`, { integer: true })
        validateNonNegativeNumber(caravan.unit_price, `${path}.unit_price`)
        validateNonNegativeNumber(caravan.departed_tick, `${path}.departed_tick`, { integer: true })
        validateNonNegativeNumber(caravan.arrives_tick, `${path}.arrives_tick`, { integer: true })
        if (!isPoint(caravan.from)) issues.push(`${path}.from is invalid`)
        if (!isPoint(caravan.to)) issues.push(`${path}.to is invalid`)
      }
    }
  }

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
