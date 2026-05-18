import { Result, ok, err } from 'neverthrow'
import { decode as msgpackDecode } from '@msgpack/msgpack'
import type { WorldState, GridState, GridWire, OrganismState, AnimalState } from '../types'
import { WorldEnvelopeSchema } from '../types/schemas'

export type ParseError =
  | { kind: 'json';     message: string }
  | { kind: 'schema';   issues: string[] }

export interface OrgsHotSoa {
  ids:            string[]
  xs:             number[]
  ys:             number[]
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

export async function fetchSnapshotWithProgress(url: string): Promise<ArrayBuffer | null> {
  let resp: Response
  try {
    resp = await fetch(url, { cache: 'no-store' })
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
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      loaded += value.byteLength
      emit()
    }
  }
  const out = new Uint8Array(loaded)
  let pos = 0
  for (const c of chunks) { out.set(c, pos); pos += c.byteLength }
  return out.buffer
}

export function expandOrgsSoa(soa: OrgsHotSoa): OrganismState[] {
  const out: OrganismState[] = new Array(soa.ids.length)
  for (let i = 0; i < soa.ids.length; i++) {
    out[i] = {
      id:            soa.ids[i],
      x:             soa.xs[i] / 10,
      y:             soa.ys[i] / 10,
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
    } as OrganismState
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
  const parsed = WorldEnvelopeSchema.safeParse(decoded)
  if (!parsed.success) {
    return err({
      kind:   'schema',
      issues: parsed.error.issues.slice(0, 3).map(i => `${i.path.join('.')}: ${i.message}`),
    })
  }
  return ok(decoded as IncomingWorldFrame)
}

export function applyGridWire(wire: GridWire, cache: GridState | null): GridState {
  const w = wire.width
  const h = wire.height

  const fire: number[][] = Array.from({ length: h }, () => new Array(w).fill(0))
  for (const [row, col, v] of wire.fire) {
    if (row < h && col < w) fire[row][col] = v / 1000
  }

  const structure: number[][] = Array.from({ length: h }, () => new Array(w).fill(0))
  for (const [row, col, v] of wire.structure) {
    if (row < h && col < w) structure[row][col] = v / 100
  }

  let food_trail = cache?.food_trail
  let water_trail = cache?.water_trail
  let path_trail = cache?.path_trail
  if (wire.trails) {
    food_trail  = Array.from({ length: h }, () => new Array(w).fill(0))
    water_trail = Array.from({ length: h }, () => new Array(w).fill(0))
    path_trail  = Array.from({ length: h }, () => new Array(w).fill(0))
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
    fertility = Array.from({ length: h }, () => new Array(w).fill(0.4))
    for (const [row, col, v] of wire.fertility) {
      if (row < h && col < w) fertility[row][col] = v / 100
    }
  }

  let hazard = cache?.hazard
  if (wire.hazard) {
    hazard = Array.from({ length: h }, () => new Array(w).fill(0))
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
