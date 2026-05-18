import { useEffect, useRef, useState } from 'react'
import type { WorldState, GridState, OrganismState, AnimalState } from '../types'
import { WS_BASE, API_BASE } from '../lib/config'
import { useWorldStore } from '../stores/worldStore'
import { fetchSnapshotWithProgress, parseWorldFrame } from './wire'
import { mergeFrame, type MergeCaches } from './merge'

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
  const queuedMsgs  = useRef<Array<ArrayBuffer | Uint8Array | string>>([])
  const rafPending = useRef<number | null>(null)
  const gridCache  = useRef<GridState | null>(null)
  const prevWorldRef    = useRef<WorldState | null>(null)
  const currentWorldRef = useRef<WorldState | null>(null)
  const prevServerAtRef    = useRef<number>(0)
  const currentServerAtRef = useRef<number>(0)
  const currentReceivedAtRef = useRef<number>(0)
  const lastFrameIdRef = useRef<number>(0)
  const awaitingFullFrameRef = useRef(false)
  const snapshotPendingRef = useRef(false)
  const bootstrapPendingRef = useRef(true)

  const REACT_THROTTLE_MS  = 500
  const lastSetWorldAtRef  = useRef<number>(0)
  const pendingSetWorldRef = useRef<WorldState | null>(null)
  const setWorldTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snapshotFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const MAX_BUFFERED_MESSAGES = 32
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
      bootstrapPendingRef.current = true
      const savedLastFrameId = lastFrameIdRef.current
      lastFrameIdRef.current = 0
      fetchSnapshotWithProgress(SNAPSHOT_URL)
        .then(buf => {
          if (destroyed) return
          if (buf == null) {
            lastFrameIdRef.current = savedLastFrameId
            if (bootstrapPendingRef.current) {
              bootstrapPendingRef.current = false
              scheduleFlush()
            }
            return
          }
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
          if (lastFrameIdRef.current > 0 && parsed.frame_id <= lastFrameIdRef.current) {
            continue
          }
          if (lastFrameIdRef.current > 0 && parsed.frame_id > lastFrameIdRef.current + 1) {
            const gap = parsed.frame_id - lastFrameIdRef.current - 1
            if (gap > 2 && !awaitingFullFrameRef.current) {
              markAwaitingFullFrame()
            }
          }

          const caches: MergeCaches = {
            organisms: organismCache.current,
            animals:   animalCache.current,
            grid:      gridCache.current,
            prevWorld: currentWorldRef.current,
          }
          const { next, grid } = mergeFrame(parsed, caches)
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
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        if (destroyed) return
        setConnected(true)
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
        ws.onclose = null
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
