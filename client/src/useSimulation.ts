import { useEffect, useRef, useState } from 'react'
import { Result, ok, err } from 'neverthrow'
import { decode as msgpackDecode } from '@msgpack/msgpack'
import type { WorldState, GridState, GridWire, OrganismState, AnimalState } from './types'
import { WS_BASE, API_BASE } from './config'
import { WorldEnvelopeSchema } from './schemas'
import { useWorldStore } from './worldStore'

const WS_URL       = `${WS_BASE}/ws`
const SNAPSHOT_URL = `${API_BASE}/snapshot`

type ParseError =
  | { kind: 'json';     message: string }
  | { kind: 'schema';   issues: string[] }

/** Structure-of-arrays hot payload. Sent on every delta in place of
 *  the AoS `organisms` array. Each field is N entries long where N is
 *  the number of in-viewport alive organisms; all arrays share an
 *  index, so `ids[i] -> xs[i], ys[i], ...`.
 *
 *  Numeric quantization on the wire (decoded back to floats below):
 *   - xs/ys: i16 decimetres (server divided original x by 0.1 before
 *     casting). Client re-multiplies to recover the original f32.
 *   - energies/hydrations/healths/infections/fear_levels: u8 percent
 *     (0..100). Client divides by 100 to recover the 0..1 range. */
interface OrgsHotSoa {
  ids:            string[]
  xs:             number[]   // i16 * 10 on the wire
  ys:             number[]
  energies:       number[]   // u8 percent on the wire
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

type IncomingWorldFrame =
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
    // Exactly one of `organisms` (AoS, full snapshots) or `organisms_hot`
    // (SoA, deltas) is present. Sender guarantees this; receiver branches
    // in flushUpdate.
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

// Stream the /snapshot response and emit progress events as bytes
// arrive. Returns the assembled ArrayBuffer, or null on failure.
// Uses Content-Length to drive a determinate progress bar when the
// server provides it (it does); otherwise reports loaded-bytes-only.
async function fetchSnapshotWithProgress(url: string): Promise<ArrayBuffer | null> {
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

/** Expand a SoA payload into per-organism partial updates. The caller
 *  then merges these into the existing cache (same path the AoS-delta
 *  branch used to follow). Cost: O(N) where N is the number of orgs in
 *  the delta - one allocation per org, no per-field key parsing. */
function expandOrgsSoa(soa: OrgsHotSoa): OrganismState[] {
  const out: OrganismState[] = new Array(soa.ids.length)
  for (let i = 0; i < soa.ids.length; i++) {
    out[i] = {
      id:            soa.ids[i],
      // Reverse the wire-side quantization. Multipliers must match
      // organism.rs::q_pos / q_pct.
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
      // Cold/warm fields rely on the existing cache via mergeDefined.
      // OrganismState requires lineage_id/generation/parent_id/etc but
      // those are filled in from the cached full-snapshot entry, so the
      // expanded record acts as a partial update.
    } as OrganismState
  }
  return out
}

/**
 * Decode + validate one WS frame. The wire format is MessagePack (binary),
 * which decodes 3-5x faster than JSON.parse on the main thread and ships
 * ~5-15% fewer bytes for our payload shape. The legacy JSON fallback
 * stays for the rare case where a string lands (e.g. proxies that
 * convert binary). Returns a Result so the caller can log/skip on bad
 * data instead of swallowing it.
 */
function parseWorldFrame(raw: ArrayBuffer | Uint8Array | string): Result<IncomingWorldFrame, ParseError> {
  let decoded: unknown
  try {
    if (typeof raw === 'string') {
      // JSON fallback for legacy/text frames.
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

/** Rebuild dense fire_intensity and structure 2D arrays from sparse wire format. */
function applyGridWire(wire: GridWire, cache: GridState | null): GridState {
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

  // Static overlays - trails / fertility / hazard. Only refreshed on
  // static frames (every 30 ticks). Fall back to the cached layer when
  // the wire doesn't include them.
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
    // Default baseline 0.40; sparse entries override.
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

export interface InterpRefs {
  prev:    React.MutableRefObject<WorldState | null>
  current: React.MutableRefObject<WorldState | null>
  prevServerAt: React.MutableRefObject<number>
  currentServerAt: React.MutableRefObject<number>
  currentReceivedAt: React.MutableRefObject<number>
}

const EMPTY_HISTORY: WorldState['history'] = {
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

export function useSimulation(): { world: WorldState | null; connected: boolean; interp: InterpRefs } {
  const [world, setWorld]     = useState<WorldState | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef      = useRef<WebSocket | null>(null)
  const organismCache = useRef<Map<string, OrganismState>>(new Map())
  const animalCache   = useRef<Map<number, AnimalState>>(new Map())
  // WS frames arrive as ArrayBuffer (binary MessagePack) at runtime.
  // `string` retained for the snapshot HTTP path historical fallback +
  // for tests / proxies that downgrade to text.
  const queuedMsgs  = useRef<Array<ArrayBuffer | Uint8Array | string>>([])
  const rafPending = useRef<number | null>(null)
  // Grid cache - holds the last fully-populated grid state so we can fill in
  // the static maps that aren't sent every tick.
  const gridCache  = useRef<GridState | null>(null)
  // Interpolation refs - the canvas reads these directly and runs a 60fps
  // RAF loop that lerps organism positions between `prev` and `current`.
  // This decouples render rate from message rate so a 1-second WS gap turns
  // into smooth slow-motion instead of a freeze + teleport.
  const prevWorldRef    = useRef<WorldState | null>(null)
  const currentWorldRef = useRef<WorldState | null>(null)
  const prevServerAtRef    = useRef<number>(0)
  const currentServerAtRef = useRef<number>(0)
  const currentReceivedAtRef = useRef<number>(0)
  const lastFrameIdRef = useRef<number>(0)
  const awaitingFullFrameRef = useRef(false)
  const snapshotPendingRef = useRef(false)
  // True until the first HTTP /snapshot has been applied. While set,
  // WS deltas land in queuedMsgs but flushUpdate is NOT scheduled - the
  // snapshot's arrival is what flushes everything. Without this gate,
  // deltas with frame_id > snapshot's would set lastFrameIdRef first
  // and the snapshot would get dropped by dedupe.
  const bootstrapPendingRef = useRef(true)

  // React-state throttle. The canvas reads currentWorldRef every RAF (60fps),
  // but the sidebar / cards / panels react to the `world` state - and at
  // TICK_MS=100 the WS pushes 10 messages/sec, which would have React
  // reconcile 200+ OrgCards ten times per second. Cap that to ~2 Hz so the
  // sim layer is uncoupled from React's render budget.
  const REACT_THROTTLE_MS  = 500
  const lastSetWorldAtRef  = useRef<number>(0)
  const pendingSetWorldRef = useRef<WorldState | null>(null)
  const setWorldTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snapshotFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Client-side absorb buffer. At 10 Hz, 32 messages = ~3.2s of work
    // that the RAF loop can swallow before we start dropping. Mostly
    // matters when the tab unbackgrounds and several queued WS messages
    // arrive in one event-loop tick.
    const MAX_BUFFERED_MESSAGES = 32
    // Server pushes the cached `latest_full` frame over the open WS as soon
    // as it sees a Lagged(>=3) on the broadcast channel. That arrives in a
    // few ms over the already-open socket, so we wait this long before
    // falling back to an HTTP /snapshot fetch. If a `full` frame lands
    // during the grace window the timer is cancelled and we never spend
    // the round-trip.
    const SNAPSHOT_FETCH_GRACE_MS = 250

    function scheduleFlush() {
      if (rafPending.current === null) {
        rafPending.current = requestAnimationFrame(flushUpdate)
      }
    }

    function enqueueMessage(raw: ArrayBuffer | Uint8Array | string) {
      if (queuedMsgs.current.length >= MAX_BUFFERED_MESSAGES) {
        queuedMsgs.current.shift()
        markAwaitingFullFrame()
      }
      queuedMsgs.current.push(raw)
      // While bootstrap is pending the WS is feeding us deltas that
      // can't be applied yet (their frame_id is ahead of the snapshot
      // we'll bootstrap from). We buffer them and the snapshot's
      // arrival flushes everything in one go.
      if (!bootstrapPendingRef.current) {
        scheduleFlush()
      }
    }

    function markAwaitingFullFrame() {
      awaitingFullFrameRef.current = true
      if (snapshotFetchTimerRef.current !== null) return
      snapshotFetchTimerRef.current = setTimeout(() => {
        snapshotFetchTimerRef.current = null
        if (destroyed) return
        if (!awaitingFullFrameRef.current) return
        requestSnapshotResync()
      }, SNAPSHOT_FETCH_GRACE_MS)
    }

    function cancelPendingSnapshotFetch() {
      if (snapshotFetchTimerRef.current !== null) {
        clearTimeout(snapshotFetchTimerRef.current)
        snapshotFetchTimerRef.current = null
      }
    }

    function requestSnapshotResync() {
      if (destroyed || snapshotPendingRef.current) return
      snapshotPendingRef.current = true
      // Re-engage the bootstrap gate for the duration of the fetch.
      // Without this, WS deltas arriving during the ~200-500ms fetch
      // would flush through flushUpdate, advance lastFrameIdRef past
      // the snapshot's frame_id, and the snapshot would be dropped by
      // dedupe when it finally arrives. Holding the gate makes the
      // arriving snapshot the next thing applied, which is the point.
      bootstrapPendingRef.current = true
      // Also reset the dedupe ref to 0 - the snapshot we're about to
      // get is the new ground truth, and any frames buffered after
      // the snapshot should re-apply on top of it. lastFrameIdRef=0
      // skips the dedupe gate for the next applied frame.
      const savedLastFrameId = lastFrameIdRef.current
      lastFrameIdRef.current = 0
      fetchSnapshotWithProgress(SNAPSHOT_URL)
        .then(buf => {
          if (destroyed) return
          if (buf == null) {
            // Snapshot fetch failed - restore the previous frame_id so
            // dedupe still drops already-applied frames, and let live
            // WS deltas resume so the world isn't permanently stuck.
            lastFrameIdRef.current = savedLastFrameId
            if (bootstrapPendingRef.current) {
              bootstrapPendingRef.current = false
              scheduleFlush()
            }
            return
          }
          // The snapshot must apply BEFORE any buffered WS deltas, even
          // though the deltas are from a later tick. Prepend it to the
          // queue and unblock the flush gate. flushUpdate processes
          // the snapshot first (sets lastFrameIdRef and seeds caches),
          // then applies the deltas - any with frame_id <= snapshot's
          // get dropped by the existing dedupe.
          queuedMsgs.current.unshift(buf)
          bootstrapPendingRef.current = false
          scheduleFlush()
        })
        .catch(() => {
          lastFrameIdRef.current = savedLastFrameId
          if (bootstrapPendingRef.current) {
            bootstrapPendingRef.current = false
            scheduleFlush()
          }
        })
        .finally(() => {
          snapshotPendingRef.current = false
        })
    }

    function flushUpdate() {
      rafPending.current = null
      const pending = queuedMsgs.current.splice(0, queuedMsgs.current.length)
      let latest: WorldState | null = null
      for (const raw of pending) {
        const parseResult = parseWorldFrame(raw)
        if (parseResult.isErr()) {
          const e = parseResult.error
          if (e.kind === 'json') console.warn('[ws] bad json:', e.message)
          else                    console.warn('[ws] schema mismatch:', e.issues)
          continue
        }
        try {
          const parsed = parseResult.value
          // Out-of-order or stale: a frame_id we've already processed.
          // Always safe to drop.
          if (lastFrameIdRef.current > 0 && parsed.frame_id <= lastFrameIdRef.current) {
            continue
          }
          // Gap detection. A "gap" means one or more frames the
          // broadcaster sent never reached us (server-side Lagged or
          // network drop). We APPLY this delta anyway - the cache is
          // merge-only and a few hundred ms of slightly stale organism
          // state is far better than freezing the world for 3 seconds
          // waiting for the next full snapshot. We also kick off an
          // HTTP snapshot fetch to catch up cleanly when the gap is
          // big enough that culled organisms or new births might be
          // missing from the cache.
          if (lastFrameIdRef.current > 0 && parsed.frame_id > lastFrameIdRef.current + 1) {
            const gap = parsed.frame_id - lastFrameIdRef.current - 1
            // Log once per resync arc, not per delta in the gap. The
            // awaitingFullFrameRef flag dedupes: it's set here and
            // cleared further down when a `full` frame lands.
            if (gap > 2 && !awaitingFullFrameRef.current) {
              console.warn('[ws] frame gap detected:', { from: lastFrameIdRef.current, to: parsed.frame_id, gap })
              markAwaitingFullFrame()
            }
          }

          const grid   = applyGridWire(parsed.grid, gridCache.current)
          gridCache.current = grid

          function mergeDefined<T extends object>(target: T, src: Partial<T>): T {
            const out = { ...target } as Record<string, unknown>
            for (const k in src) {
              const v = (src as Record<string, unknown>)[k]
              if (v !== null && v !== undefined) out[k] = v
            }
            return out as T
          }

          // Resolve organisms list from whichever wire format is in
          // this frame. Full snapshots ship AoS under `organisms`;
          // deltas ship SoA under `organisms_hot`, which we expand
          // into the same partial-update shape the AoS path used.
          const frameOrganisms: OrganismState[] = parsed.organisms
            ?? (parsed.organisms_hot ? expandOrgsSoa(parsed.organisms_hot) : [])

          if (parsed.organisms_complete) {
            // Periodic WS fulls re-list every org but omit cold fields, so merge
            // against the prior cache instead of replacing it wholesale.
            const next = new Map<string, OrganismState>()
            for (const org of frameOrganisms) {
              const existing = organismCache.current.get(org.id)
              next.set(org.id, existing ? mergeDefined(existing, org) : org)
            }
            organismCache.current = next
          } else {
            for (const org of frameOrganisms) {
              const existing = organismCache.current.get(org.id)
              organismCache.current.set(org.id, existing ? mergeDefined(existing, org) : org)
            }
          }

          if (parsed.animals_complete) {
            animalCache.current = new Map(parsed.animals.map(a => [a.id, a]))
          } else {
            for (const animal of parsed.animals) {
              const existing = animalCache.current.get(animal.id)
              animalCache.current.set(animal.id, existing ? mergeDefined(existing, animal) : animal)
            }
          }

          const viewportOrgs = frameOrganisms.map(o =>
            organismCache.current.get(o.id) ?? o
          )
          const viewportAnimals = parsed.animals.map(a =>
            animalCache.current.get(a.id) ?? a
          )
          const base = currentWorldRef.current

          const next: WorldState = {
            frame_id: parsed.frame_id,
            server_sent_at_ms: parsed.server_sent_at_ms,
            frame_kind: parsed.frame_kind,
            tick: parsed.tick,
            grid,
            events: parsed.events ?? base?.events ?? [],
            is_day: parsed.is_day,
            day_progress: parsed.day_progress,
            season: parsed.season,
            season_progress: parsed.season_progress,
            drought: parsed.drought,
            weather: parsed.weather,
            history: parsed.history ?? base?.history ?? EMPTY_HISTORY,
            story_history: parsed.story_history ?? base?.story_history ?? [],
            pop_history: parsed.pop_history ?? base?.pop_history ?? [],
            tribal_relations: parsed.tribal_relations ?? base?.tribal_relations ?? [],
            lineage_sizes: parsed.lineage_sizes ?? base?.lineage_sizes ?? [],
            lineage_names: parsed.lineage_names ?? base?.lineage_names,
            lineage_centroid_history: parsed.lineage_centroid_history ?? base?.lineage_centroid_history,
            current_era: parsed.current_era ?? base?.current_era,
            sex_words: parsed.sex_words ?? base?.sex_words,
            organisms: [...organismCache.current.values()],
            viewport_organisms: viewportOrgs,
            organisms_complete: parsed.organisms_complete,
            animals: [...animalCache.current.values()],
            viewport_animals: viewportAnimals,
            animals_complete: parsed.animals_complete,
          }

          prevWorldRef.current    = currentWorldRef.current
          prevServerAtRef.current = currentServerAtRef.current
          currentWorldRef.current = next
          currentServerAtRef.current = parsed.server_sent_at_ms
          currentReceivedAtRef.current = performance.now()
          lastFrameIdRef.current = parsed.frame_id
          if (parsed.frame_kind === 'full') {
            awaitingFullFrameRef.current = false
            cancelPendingSnapshotFetch()
          }
          latest = next
        } catch (_) {}
      }

      if (latest === null) return

      pendingSetWorldRef.current = latest
      const sinceLast = performance.now() - lastSetWorldAtRef.current
      const publish = (w: WorldState) => {
        lastSetWorldAtRef.current = performance.now()
        // Zustand store is the canonical place panels subscribe through.
        // setWorld (useState) is kept for back-compat with components that
        // still consume `world` via useSimulation's return value.
        useWorldStore.getState().setWorld(w)
        setWorld(w)
      }
      if (sinceLast >= REACT_THROTTLE_MS) {
        publish(latest)
        if (setWorldTimerRef.current) {
          clearTimeout(setWorldTimerRef.current)
          setWorldTimerRef.current = null
        }
      } else if (setWorldTimerRef.current === null) {
        const delay = REACT_THROTTLE_MS - sinceLast
        setWorldTimerRef.current = setTimeout(() => {
          setWorldTimerRef.current = null
          const w = pendingSetWorldRef.current
          if (w) publish(w)
        }, delay)
      }
    }

    let destroyed = false

    function connect() {
      const ws = new WebSocket(WS_URL)
      // Without this, binary frames arrive as Blob and you'd need an
      // async .arrayBuffer() call before decoding - we want sync decode
      // in the RAF flush loop.
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        if (destroyed) return
        setConnected(true)
        // Server doesn't send a primer on WS connect anymore - the
        // bootstrap snapshot rides HTTP /snapshot (gzipped, no impact
        // on the sim-lock hot path). Fire the fetch as soon as we know
        // the socket is alive so live deltas + the HTTP snapshot can
        // race - the dedupe-by-frame_id path stitches them in order.
        requestSnapshotResync()
      }
      ws.onclose = () => {
        if (destroyed) return
        setConnected(false)
        if (rafPending.current !== null) {
          cancelAnimationFrame(rafPending.current)
          rafPending.current = null
        }
        queuedMsgs.current = []
        // Re-arm the bootstrap gate so the reconnect's first deltas
        // get buffered and the post-reconnect /snapshot fetch flushes
        // them with the right ordering.
        bootstrapPendingRef.current = true
        setTimeout(connect, 2000)
      }
      ws.onmessage = (e) => {
        if (destroyed) return
        enqueueMessage(e.data)
      }
    }

    connect()
    return () => {
      destroyed = true
      if (rafPending.current !== null) {
        cancelAnimationFrame(rafPending.current)
        rafPending.current = null
      }
      if (setWorldTimerRef.current !== null) {
        clearTimeout(setWorldTimerRef.current)
        setWorldTimerRef.current = null
      }
      if (snapshotFetchTimerRef.current !== null) {
        clearTimeout(snapshotFetchTimerRef.current)
        snapshotFetchTimerRef.current = null
      }
      queuedMsgs.current = []
      const ws = wsRef.current
      if (ws) {
        ws.onclose = null   // prevent reconnect loop on intentional teardown
        ws.onmessage = null
        ws.close()
        wsRef.current = null
      }
    }
  }, [])

  return {
    world,
    connected,
    interp: {
      prev:      prevWorldRef,
      current:   currentWorldRef,
      prevServerAt: prevServerAtRef,
      currentServerAt: currentServerAtRef,
      currentReceivedAt: currentReceivedAtRef,
    },
  }
}
