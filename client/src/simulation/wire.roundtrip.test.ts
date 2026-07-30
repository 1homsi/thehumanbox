/**
 * Wire schema round-trip: the Rust simulation server emits frames
 * via serde_json + rmp-serde with a specific shape. This test takes
 * a fixture matching that exact shape (the same JSON object we'd
 * get from `to_world_payload` server-side, then msgpack-encoded
 * with @msgpack/msgpack), and verifies the client's parseWorldFrame
 * unpacks it into a typed frame without losing or mis-typing any
 * field the renderer relies on.
 *
 * Keeping this in TS-only land sidesteps the build-time fixture
 * generation pipeline. The shape is hand-curated to match
 * simulation/sim/serialize.rs; if either side drifts, this test
 * catches it before the regression hits the live wire.
 */
import { describe, it, expect } from 'vitest'
import { encode as msgpackEncode } from '@msgpack/msgpack'
import { parseWorldFrame } from './wire'

const knownDelta = () => ({
  frame_id: 42,
  server_sent_at_ms: 1716297600_000,
  frame_kind: 'delta',
  tick: 12345,
  is_day: true,
  day_progress: 0.42,
  season: 'recovery',
  season_progress: 0.7,
  drought: false,
  weather: { kind: 'rain', intensity: 0.6, wind_x: 0.4, wind_y: 0.1 },
  grid: {
    width: 600,
    height: 300,
    origin_x: 0,
    origin_y: 0,
    fire: [[10, 20, 750]] as Array<[number, number, number]>,
    structure: [[5, 5, 80]] as Array<[number, number, number]>,
  },
  organisms_hot: {
    ids: ['org-1'],
    xs: [3000],
    ys: [2000],
    vxs: [5],
    vys: [-2],
    energies: [82],
    hydrations: [70],
    healths: [95],
    // alives dropped from deltas; client merge preserves the cached
    // value across deltas. Server only emits full-frame AoS when an
    // org's alive flag changes anyway.
    thoughts: [[0, 'exploring']] as Array<[number, string]>,
    infections: [0],
    fear_levels: [0],
    carryings: [0],
    carrying_types: [0],
    pregnants: [false],
    partner_ids: [] as Array<[number, string]>,
    attracted_tos: [] as Array<[number, string]>,
  },
  organisms_complete: false,
  animals: [],
  animals_complete: false,
  lineage_strategies: {
    'lineage-1': {
      strategy: 'explore',
      expires_tick: 12600,
      started_tick: 12000,
      progress: 18,
      target: 60,
      completed: false,
      completed_tick: null,
      status: 'active',
    },
  },
  lineage_strategy_history: [
    {
      lineage_id: 'lineage-1',
      lineage_name: 'Wayfinders',
      strategy: 'settle',
      started_tick: 11000,
      ended_tick: 11800,
      progress: 40,
      target: 80,
      outcome: 'redirected',
      reason: 'player_redirected',
    },
  ],
  trade_routes: [
    {
      id: 7,
      lineage_a: 'lineage-1',
      lineage_b: 'lineage-2',
      a_center: [100, 80] as [number, number],
      b_center: [240, 160] as [number, number],
      established_tick: 12000,
      last_dispatch_tick: 12300,
      deliveries: 4,
      volume: 11,
    },
  ],
  caravans: [
    {
      id: 9,
      route_id: 7,
      sender_lineage: 'lineage-1',
      receiver_lineage: 'lineage-2',
      sender_org_id: 'org-1',
      cargo: 'wood',
      amount: 3,
      unit_price: 2,
      departed_tick: 12300,
      arrives_tick: 12600,
      from: [100, 80] as [number, number],
      to: [240, 160] as [number, number],
    },
  ],
})

describe('wire round-trip', () => {
  it('decodes a msgpack-encoded delta frame the renderer can use', () => {
    const original = knownDelta()
    const bytes = msgpackEncode(original)
    const result = parseWorldFrame(bytes)

    expect(result.isOk()).toBe(true)
    if (result.isErr()) return // narrowing
    const f = result.value

    expect(f.frame_id).toBe(42)
    expect(f.tick).toBe(12345)
    expect(f.frame_kind).toBe('delta')
    expect(f.season).toBe('recovery')
    expect(f.weather.kind).toBe('rain')
    expect(f.weather.intensity).toBeCloseTo(0.6, 5)
    // New wind fields survive the round trip.
    expect(f.weather.wind_x).toBeCloseTo(0.4, 5)
    expect(f.weather.wind_y).toBeCloseTo(0.1, 5)

    expect(f.grid.width).toBe(600)
    expect(f.grid.fire[0]).toEqual([10, 20, 750])
    expect(f.grid.structure[0]).toEqual([5, 5, 80])

    expect(f.organisms_hot?.ids[0]).toBe('org-1')
    expect(f.organisms_hot?.xs[0]).toBe(3000)
    // `ages` was removed from the delta SoA; the wire decoder must
    // accept payloads without it.
    expect((f.organisms_hot as unknown as { ages?: unknown }).ages).toBeUndefined()
    expect(f.organisms_complete).toBe(false)
    expect(f.animals).toEqual([])
    expect(f.lineage_strategies?.['lineage-1']?.progress).toBe(18)
    expect(f.lineage_strategy_history?.[0]).toMatchObject({
      lineage_name: 'Wayfinders',
      outcome: 'redirected',
      reason: 'player_redirected',
    })
    expect(f.trade_routes?.[0]).toMatchObject({
      id: 7,
      lineage_a: 'lineage-1',
      lineage_b: 'lineage-2',
      deliveries: 4,
      volume: 11,
    })
    expect(f.caravans?.[0]).toMatchObject({
      id: 9,
      route_id: 7,
      cargo: 'wood',
      amount: 3,
      arrives_tick: 12600,
    })
  })

  it('also accepts a JSON-encoded frame (legacy path)', () => {
    const original = knownDelta()
    const json = JSON.stringify(original)
    const result = parseWorldFrame(json)
    expect(result.isOk()).toBe(true)
    if (result.isErr()) return
    expect(result.value.frame_id).toBe(42)
    // thoughts is sparse `[[idx, text], …]` now - first entry tuple
    // is the (index, text) pair for the only modified org.
    const t = result.value.organisms_hot?.thoughts
    expect(Array.isArray(t)).toBe(true)
    expect((t as Array<[number, string]>)[0]).toEqual([0, 'exploring'])
  })

  it('rejects payloads missing required envelope fields', () => {
    const partial = { ...knownDelta(), organisms_complete: 'yes' as unknown }
    const bytes = msgpackEncode(partial as unknown as object)
    const result = parseWorldFrame(bytes)
    expect(result.isErr()).toBe(true)
    if (result.isOk()) return
    expect(result.error.kind).toBe('schema')
  })

  it('rejects malformed campaign state at the wire boundary', () => {
    const malformed = {
      ...knownDelta(),
      lineage_strategies: {
        'lineage-1': {
          strategy: 'trade',
          expires_tick: -1,
          status: 'stuck',
          completed: 'yes',
          completed_tick: -2,
        },
      },
      lineage_strategy_history: [
        {
          lineage_id: 'lineage-1',
          lineage_name: 'Traders',
          strategy: 'trade',
          started_tick: 100,
          ended_tick: 200,
          progress: 20,
          target: 40,
          outcome: 'failed',
          reason: 'unknown_failure',
        },
      ],
    }
    const result = parseWorldFrame(msgpackEncode(malformed))

    expect(result.isErr()).toBe(true)
    if (result.isOk()) return
    expect(result.error.kind).toBe('schema')
    if (result.error.kind !== 'schema') return
    expect(result.error.issues).toContain('lineage_strategies.lineage-1.expires_tick is invalid')
    expect(result.error.issues).toContain('lineage_strategies.lineage-1.status is invalid')
    expect(result.error.issues).toContain('lineage_strategies.lineage-1.completed is not a boolean')
    expect(result.error.issues).toContain('lineage_strategies.lineage-1.completed_tick is invalid')
    expect(result.error.issues).toContain('lineage_strategy_history.0.reason is invalid')
  })

  it('rejects malformed trade routes and caravans at the wire boundary', () => {
    const malformed = {
      ...knownDelta(),
      trade_routes: [
        {
          id: -1,
          lineage_a: '',
          lineage_b: 'lineage-2',
          a_center: [100],
          b_center: [240, 160],
          established_tick: 1.5,
          last_dispatch_tick: -1,
          deliveries: -2,
          volume: -3,
        },
      ],
      caravans: [
        {
          id: 1.5,
          route_id: -1,
          sender_lineage: '',
          receiver_lineage: 'lineage-2',
          sender_org_id: 99,
          cargo: '',
          amount: -1,
          unit_price: Number.NaN,
          departed_tick: 10.5,
          arrives_tick: -1,
          from: [0, Number.POSITIVE_INFINITY],
          to: 'nowhere',
        },
      ],
    }
    const result = parseWorldFrame(JSON.stringify(malformed))

    expect(result.isErr()).toBe(true)
    if (result.isOk() || result.error.kind !== 'schema') return
    expect(result.error.issues).toContain('trade_routes.0.id is invalid')
    expect(result.error.issues).toContain('trade_routes.0.a_center is invalid')
    expect(result.error.issues).toContain('caravans.0.route_id is invalid')
    expect(result.error.issues).toContain('caravans.0.sender_org_id is invalid')
    expect(result.error.issues).toContain('caravans.0.to is invalid')
  })
})
