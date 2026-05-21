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
    ids:        ['org-1'],
    xs:         [3000],
    ys:         [2000],
    vxs:        [5],
    vys:        [-2],
    energies:   [82],
    hydrations: [70],
    healths:    [95],
    // alives dropped from deltas; client merge preserves the cached
    // value across deltas. Server only emits full-frame AoS when an
    // org's alive flag changes anyway.
    thoughts:    [[0, 'exploring']] as Array<[number, string]>,
    infections: [0],
    fear_levels:[0],
    carryings:  [0],
    carrying_types: [0],
    pregnants:  [false],
    partner_ids:   [] as Array<[number, string]>,
    attracted_tos: [] as Array<[number, string]>,
  },
  organisms_complete: false,
  animals: [],
  animals_complete: false,
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
})
