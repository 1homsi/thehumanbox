import { Result, ok, err } from 'neverthrow'
import { decode as msgpackDecode } from '@msgpack/msgpack'
import type { WorldState, GridState, GridWire, OrganismState, AnimalState } from '../types'

export type ParseError =
  | { kind: 'json';     message: string }
  | { kind: 'schema';   issues: string[] }

export interface OrgsHotSoa {
  ids:            string[]
  xs:             number[]
  ys:             number[]
  vxs:            number[]
  vys:            number[]
  target_xs?:     number[]
  target_ys?:     number[]
  energies:       number[]
  hydrations:     number[]
  healths:        number[]
  ages:           number[]
  alives:         boolean[]
  thoughts:       string[]
  infections:     number[]
  fear_levels:    number[]
  carryings:      number[]
  carrying_types: number[]
  pregnants:      boolean[]
  partner_ids:    (string | null)[]
  attracted_tos:  (string | null)[]
}

export type IncomingWorldFrame =
  Pick<WorldState,
    'frame_id' |
    'server_sent_at_ms' |
    'frame_kind' |
    'tick' |
    'is_day' |
    'day_progress' |
    'season' |
    'season_progress' |
    'drought' |
    'weather'
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
    current_era?: WorldState['current_era']
    sex_words?: WorldState['sex_words']
  }

export async function fetchSnapshotWithProgress(url: string, signal?: AbortSignal): Promise<ArrayBuffer | null> {
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
  const emit = () => window.dispatchEvent(
    new CustomEvent('thb-snapshot-progress', { detail: { loaded, total } })
  )
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
  for (const c of chunks) { out.set(c, pos); pos += c.byteLength }
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

export function expandOrgsSoa(soa: OrgsHotSoa): ExpandedOrgDelta[] {
  const out: ExpandedOrgDelta[] = new Array(soa.ids.length)
  for (let i = 0; i < soa.ids.length; i++) {
    out[i] = {
      id:            soa.ids[i],
      x:             soa.xs[i] / 10,
      y:             soa.ys[i] / 10,
      vx:            soa.vxs[i] / 10,
      vy:            soa.vys[i] / 10,
      target_x:      (soa.target_xs && soa.target_xs[i] !== -32768) ? soa.target_xs[i] : undefined,
      target_y:      (soa.target_ys && soa.target_ys[i] !== -32768) ? soa.target_ys[i] : undefined,
      energy:        soa.energies[i] / 100,
      hydration:     soa.hydrations[i] / 100,
      health:        soa.healths[i] / 100,
      age:           soa.ages[i],
      alive:         soa.alives[i],
      thought:       soa.thoughts[i],
      infection:     soa.infections[i] / 100,
      fear_level:    soa.fear_levels[i] / 100,
      carrying:      soa.carryings[i],
      carrying_type: soa.carrying_types[i],
      pregnant:      soa.pregnants[i],
      partner_id:    soa.partner_ids[i] ?? undefined,
      attracted_to:  soa.attracted_tos[i] ?? undefined,
    }
  }
  return out
}

export function parseWorldFrame(raw: ArrayBuffer | Uint8Array | string): Result<IncomingWorldFrame, ParseError> {
  let decoded: unknown
  try {
    if (typeof raw === 'string') {
      decoded = JSON.parse(raw)
    } else {
      const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
      decoded = msgpackDecode(bytes)
    }
  } catch (e) {
    return err({ kind: 'json', message: e instanceof Error ? e.message : String(e) })
  }
  if (!decoded || typeof decoded !== 'object') {
    return err({ kind: 'schema', issues: ['root is not an object'] })
  }
  const d = decoded as Record<string, unknown>
  if (typeof d.frame_id !== 'number' || typeof d.tick !== 'number'
      || typeof d.organisms_complete !== 'boolean'
      || typeof d.animals_complete !== 'boolean'
      || !Array.isArray(d.animals)) {
    return err({ kind: 'schema', issues: ['envelope shape mismatch'] })
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
    food_trail  = take2D(food_trail,  h, w, 0)
    water_trail = take2D(water_trail, h, w, 0)
    path_trail  = take2D(path_trail,  h, w, 0)
    for (const [row, col, f, wv, p] of wire.trails) {
      if (row < h && col < w) {
        food_trail[row][col]  = f / 100
        water_trail[row][col] = wv / 100
        path_trail[row][col]  = p / 100
      }
    }
  }

  let fertility = cache?.fertility
  if (wire.fertility) {
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
    width:    wire.width,
    height:   wire.height,
    origin_x: wire.origin_x,
    origin_y: wire.origin_y,
    tiles:     wire.tiles     ?? cache?.tiles     ?? [],
    biomes:    wire.biomes    ?? cache?.biomes,
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
