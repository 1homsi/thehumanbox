import { useEffect, useRef, useState } from 'react'
import type { WorldState, GridState, OrganismState, AnimalState } from '../types'
import { WS_BASE, API_BASE } from '../config'
import { useWorldStore } from '../worldStore'
import { fetchSnapshotWithProgress, parseWorldFrame } from './wire'
import { mergeFrame, type MergeCaches } from './merge'

// ── Public hook ──────────────────────────────────────────────────────────
// useSimulation owns:
//   - the WS connection lifecycle (open/close/reconnect)
//   - the snapshot-bootstrap + gap-recovery dance (HTTP /snapshot fetch
//     when the WS broadcast drops frames)
//   - the message queue + RAF-driven flush loop
//   - the React-state throttle so the sidebar doesn't reconcile 10×/s
//
// Wire-format decoding and frame merging live in sibling modules
// (./wire and ./merge) so they stay independently testable and the
// hook can focus on orchestration.

const WS_URL       = `${WS_BASE}/ws`
const SNAPSHOT_URL = `${API_BASE}/snapshot`

export interface InterpRefs {
  prev:    React.MutableRefObject<WorldState | null>
  current: React.MutableRefObject<WorldState | null>
  prevServerAt: React.MutableRefObject<number>
  currentServerAt: React.MutableRefObject<number>
  currentReceivedAt: React.MutableRefObject<number>
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
            // Trigger the snapshot resync silently. We used to log this
            // but it fires every time the tab unfocuses / refocuses
            // (browser throttles the WS), and the resync flow handles
            // it cleanly without user-visible impact, so the console
            // noise was pure developer signal that bothered users.
            if (gap > 2 && !awaitingFullFrameRef.current) {
              markAwaitingFullFrame()
            }
          }

          // Delegate the heavy lifting (grid expand + organism / animal
          // cache merge + WorldState assembly) to the dedicated module.
          const caches: MergeCaches = {
            organisms: organismCache.current,
            animals:   animalCache.current,
            grid:      gridCache.current,
            prevWorld: currentWorldRef.current,
          }
          const { next, grid } = mergeFrame(parsed, caches)
          // mergeFrame may have rebuilt the org / animal maps (on a
          // *_complete frame); store the post-merge map identities
          // back into the refs.
          organismCache.current = caches.organisms
          animalCache.current   = caches.animals
          gridCache.current     = grid

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
