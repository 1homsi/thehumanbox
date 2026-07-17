import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorldState, GridState, OrganismState, AnimalState, OrgDetail, OrgLife } from '../types'
import { WS_BASE, API_BASE, IS_LOCAL_SERVER } from '../lib/config'
import { useWorldStore } from '../stores/worldStore'
import { fetchSnapshotWithProgress, parseWorldFrame } from './wire'
import { mergeFrame, type MergeCaches } from './merge'
import { updateOrgMotion, updateAnimalMotion } from '../3d/world/parts/motion-state'
import { logger } from '../lib/logger'
import {
  type WorldSource,
  OWN_WORLD_ID,
  clearOwnWorldResetRequest,
  getOwnWorldSeed,
  hasOwnWorldResetRequest,
} from './worldSource'
import { canSendSandboxCommand, type SandboxCommand } from './sandbox'
import { isDesktop } from '../lib/desktop'

const WASM_BASE_TICK_MS = 120

const WS_URL = `${WS_BASE}/ws`
const SNAPSHOT_URL = `${API_BASE}/snapshot`

export interface InterpRefs {
  prev: React.MutableRefObject<WorldState | null>
  current: React.MutableRefObject<WorldState | null>
  prevServerAt: React.MutableRefObject<number>
  currentServerAt: React.MutableRefObject<number>
  currentReceivedAt: React.MutableRefObject<number>
}

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'unreachable'
export type LocalSaveStatus =
  | { phase: 'inactive' }
  | { phase: 'loading' }
  | { phase: 'ready'; restored: boolean; tick: number }
  | { phase: 'saving'; tick: number }
  | { phase: 'saved'; tick: number; savedAt: number }
  | { phase: 'error'; message: string }

export function useSimulation(source: WorldSource = 'remote'): {
  world: WorldState | null
  connected: boolean
  status: ConnectionStatus
  failedAttempts: number
  interp: InterpRefs
  idleParked: boolean
  resume: () => void
  sandboxAvailable: boolean
  sendCommand: (cmd: SandboxCommand) => Promise<boolean>
  pauseSim: () => void
  setSpeed: (mult: number) => void
  fellBackToLocal: boolean
  localSaveStatus: LocalSaveStatus
  saveLocalWorld: () => Promise<boolean>
  loadLocalOrgDetail: (id: string) => Promise<OrgDetail | null>
  loadLocalOrgLife: (id: string) => Promise<OrgLife | null>
} {
  const [world, setWorld] = useState<WorldState | null>(null)
  const [connected, setConnected] = useState(false)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [idleParked, setIdleParked] = useState(false)
  const [fellBack, setFellBack] = useState(false)
  const [localSaveStatus, setLocalSaveStatus] = useState<LocalSaveStatus>(
    source === 'wasm' ? { phase: 'loading' } : { phase: 'inactive' },
  )
  const effectiveSource: WorldSource = source === 'wasm' || fellBack ? 'wasm' : 'remote'
  const sandboxAvailable = canSendSandboxCommand(effectiveSource, isDesktop(), IS_LOCAL_SERVER)
  const wsRef = useRef<WebSocket | null>(null)
  const wasmWorkerRef = useRef<Worker | null>(null)
  const nextWorkerRequestRef = useRef(1)
  const pendingWorkerRequestsRef = useRef(
    new Map<number, { resolve: (ok: boolean) => void; timer: ReturnType<typeof setTimeout> }>(),
  )
  const pendingWorkerDataRequestsRef = useRef(
    new Map<number, { resolve: (json: string | null) => void; timer: ReturnType<typeof setTimeout> }>(),
  )
  const organismCache = useRef<Map<string, OrganismState>>(new Map())
  const animalCache = useRef<Map<number, AnimalState>>(new Map())
  const queuedMsgs = useRef<Array<ArrayBuffer | Uint8Array | string>>([])
  const rafPending = useRef<number | null>(null)
  const gridCache = useRef<GridState | null>(null)
  const prevWorldRef = useRef<WorldState | null>(null)
  const currentWorldRef = useRef<WorldState | null>(null)
  const prevServerAtRef = useRef<number>(0)
  const currentServerAtRef = useRef<number>(0)
  const currentReceivedAtRef = useRef<number>(0)
  const lastFrameIdRef = useRef<number>(0)
  const awaitingFullFrameRef = useRef(false)
  const snapshotPendingRef = useRef(false)
  const bootstrapPendingRef = useRef(true)

  const REACT_THROTTLE_MS = 500
  const lastSetWorldAtRef = useRef<number>(0)
  const pendingSetWorldRef = useRef<WorldState | null>(null)
  const setWorldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snapshotFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resumeRef = useRef<() => void>(() => {})
  const idleParkedRef = useRef(false)
  useEffect(() => {
    idleParkedRef.current = idleParked
  }, [idleParked])

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
      if (effectiveSource === 'wasm') return
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

    let snapshotAbort: AbortController | null = null

    function requestSnapshotResync(force = false) {
      if (effectiveSource === 'wasm') return
      if (destroyed) return
      if (snapshotPendingRef.current) {
        if (!force) return
        if (snapshotAbort) snapshotAbort.abort()
        snapshotPendingRef.current = false
      }
      snapshotPendingRef.current = true
      bootstrapPendingRef.current = true
      const ctl = new AbortController()
      snapshotAbort = ctl
      const savedLastFrameId = lastFrameIdRef.current
      lastFrameIdRef.current = 0
      const scheduleSnapshotRetry = () => {
        const retryMs = 600 + Math.round(Math.random() * 600)
        setTimeout(() => {
          if (destroyed) return
          if (snapshotPendingRef.current) return
          if (currentWorldRef.current !== null) return
          requestSnapshotResync(true)
        }, retryMs)
      }
      fetchSnapshotWithProgress(SNAPSHOT_URL, ctl.signal)
        .then((buf) => {
          if (destroyed || ctl.signal.aborted) return
          if (buf == null) {
            lastFrameIdRef.current = savedLastFrameId
            if (bootstrapPendingRef.current) {
              bootstrapPendingRef.current = false
              scheduleFlush()
            }
            scheduleSnapshotRetry()
            return
          }
          queuedMsgs.current.unshift(buf)
          bootstrapPendingRef.current = false
          scheduleFlush()
        })
        .catch(() => {
          if (ctl.signal.aborted) return
          lastFrameIdRef.current = savedLastFrameId
          if (bootstrapPendingRef.current) {
            bootstrapPendingRef.current = false
            scheduleFlush()
          }
          scheduleSnapshotRetry()
        })
        .finally(() => {
          if (snapshotAbort === ctl) snapshotAbort = null
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
          if (e.kind === 'json') logger.warn('ws', 'bad json:', e.message)
          else logger.warn('ws', 'schema mismatch:', e.issues)
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
            animals: animalCache.current,
            grid: gridCache.current,
            prevWorld: currentWorldRef.current,
          }
          const { next, grid } = mergeFrame(parsed, caches)
          organismCache.current = caches.organisms
          animalCache.current = caches.animals
          gridCache.current = grid

          updateOrgMotion(next.viewport_organisms ?? next.organisms ?? [])
          updateAnimalMotion(next.viewport_animals ?? next.animals ?? [])

          prevWorldRef.current = currentWorldRef.current
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
        } catch (e) {
          // Don't swallow merge failures silently - a malformed
          // organism record was previously taking down the whole
          // frame with zero signal. Logging surfaces real bugs;
          // the loop continues so a single bad frame doesn't kill
          // the world.
          logger.warn('ws', 'frame merge failed:', e)
        }
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

    if (effectiveSource === 'wasm') {
      setIdleParked(false)
      setLocalSaveStatus({ phase: 'loading' })
      const pendingWorkerRequests = pendingWorkerRequestsRef.current
      const pendingWorkerDataRequests = pendingWorkerDataRequestsRef.current
      bootstrapPendingRef.current = false
      const worker = new Worker(new URL('./wasmWorker.ts', import.meta.url), {
        type: 'module',
      })
      wasmWorkerRef.current = worker
      let announced = false
      worker.onmessage = (e: MessageEvent) => {
        if (destroyed) return
        const m = e.data as {
          type: string
          frame?: string
          message?: string
          restored?: boolean
          tick?: number
          savedAt?: number
          requestId?: number
          ok?: boolean
          json?: string
          persistenceReady?: boolean
        }
        if (m.type === 'frame' && typeof m.frame === 'string') {
          if (!announced) {
            announced = true
            setConnected(true)
          }
          enqueueMessage(m.frame)
        } else if (m.type === 'ready') {
          if (!announced) {
            announced = true
            setConnected(true)
          }
          if (m.persistenceReady !== false) {
            setLocalSaveStatus({
              phase: 'ready',
              restored: m.restored === true,
              tick: m.tick ?? 0,
            })
          }
        } else if (m.type === 'reset_done') {
          clearOwnWorldResetRequest()
        } else if (m.type === 'saving') {
          setLocalSaveStatus({ phase: 'saving', tick: m.tick ?? 0 })
        } else if (m.type === 'saved') {
          setLocalSaveStatus({ phase: 'saved', tick: m.tick ?? 0, savedAt: m.savedAt ?? Date.now() })
        } else if ((m.type === 'command_result' || m.type === 'save_result') && m.requestId !== undefined) {
          const pending = pendingWorkerRequests.get(m.requestId)
          if (pending) {
            clearTimeout(pending.timer)
            pendingWorkerRequests.delete(m.requestId)
            pending.resolve(m.ok === true)
          }
        } else if (
          (m.type === 'org_detail_result' || m.type === 'org_life_result') &&
          m.requestId !== undefined
        ) {
          const pending = pendingWorkerDataRequests.get(m.requestId)
          if (pending) {
            clearTimeout(pending.timer)
            pendingWorkerDataRequests.delete(m.requestId)
            pending.resolve(m.json || null)
          }
        } else if (m.type === 'error' && m.message) {
          logger.warn('wasm', m.message)
          setLocalSaveStatus({ phase: 'error', message: m.message })
        }
      }
      worker.onerror = (e: ErrorEvent) => {
        logger.warn('wasm', 'worker error:', e.message)
      }
      worker.postMessage({
        type: 'start',
        id: OWN_WORLD_ID,
        seed: getOwnWorldSeed(),
        reset: hasOwnWorldResetRequest(),
      })

      const onVisibility = () => {
        if (document.visibilityState === 'hidden') {
          worker.postMessage({ type: 'save' })
          worker.postMessage({ type: 'visibility', hidden: true })
        } else {
          worker.postMessage({ type: 'visibility', hidden: false })
        }
      }
      const onPageHide = () => worker.postMessage({ type: 'save' })
      document.addEventListener('visibilitychange', onVisibility)
      window.addEventListener('pagehide', onPageHide)
      resumeRef.current = () => {
        setIdleParked(false)
        worker.postMessage({ type: 'resume' })
      }

      return () => {
        destroyed = true
        document.removeEventListener('visibilitychange', onVisibility)
        window.removeEventListener('pagehide', onPageHide)
        if (rafPending.current !== null) {
          cancelAnimationFrame(rafPending.current)
          rafPending.current = null
        }
        if (setWorldTimerRef.current !== null) {
          clearTimeout(setWorldTimerRef.current)
          setWorldTimerRef.current = null
        }
        queuedMsgs.current = []
        for (const pending of pendingWorkerRequests.values()) {
          clearTimeout(pending.timer)
          pending.resolve(false)
        }
        pendingWorkerRequests.clear()
        for (const pending of pendingWorkerDataRequests.values()) {
          clearTimeout(pending.timer)
          pending.resolve(null)
        }
        pendingWorkerDataRequests.clear()
        worker.postMessage({ type: 'stop' })
        const forceTerminate = setTimeout(() => worker.terminate(), 1500)
        worker.onmessage = (event: MessageEvent) => {
          if ((event.data as { type?: string }).type !== 'stopped') return
          clearTimeout(forceTerminate)
          worker.terminate()
        }
        wasmWorkerRef.current = null
      }
    }

    setLocalSaveStatus({ phase: 'inactive' })

    let reconnectDelayMs = 1000
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let everConnected = false
    let attempts = 0
    const REMOTE_FALLBACK_ATTEMPTS = 3

    function scheduleReconnect() {
      if (destroyed) return
      if (reconnectTimer !== null) return
      // Jittered backoff: a server restart sees hundreds of clients
      // synchronise their retries at exactly 1s/2s/4s and re-crash the
      // recovering server. Multiply by [0.5, 1.0] randomly so the
      // herd disperses.
      const jitter = 0.5 + Math.random() * 0.5
      reconnectTimer = setTimeout(
        () => {
          reconnectTimer = null
          connect()
        },
        Math.round(reconnectDelayMs * jitter),
      )
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, 15000)
    }

    function connect() {
      if (destroyed) return
      const existing = wsRef.current
      if (
        existing &&
        (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)
      ) {
        return
      }
      const ws = new WebSocket(WS_URL)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        if (destroyed) return
        reconnectDelayMs = 1000
        everConnected = true
        attempts = 0
        setConnected(true)
        setFailedAttempts(0)
        requestSnapshotResync()
      }
      ws.onclose = () => {
        if (destroyed) return
        setConnected(false)
        attempts += 1
        setFailedAttempts(attempts)
        if (rafPending.current !== null) {
          cancelAnimationFrame(rafPending.current)
          rafPending.current = null
        }
        queuedMsgs.current = []
        bootstrapPendingRef.current = true
        if (!everConnected && attempts >= REMOTE_FALLBACK_ATTEMPTS) {
          setFellBack(true)
        } else {
          scheduleReconnect()
        }
      }
      ws.onerror = () => {
        try {
          ws.close()
        } catch {
          /* noop */
        }
      }
      ws.onmessage = (e) => {
        if (destroyed) return
        enqueueMessage(e.data)
      }
    }

    connect()

    const IDLE_HIDDEN_MS = 30_000
    const IDLE_AFK_MS = 10 * 60_000
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null
    let lastInteractionAt = Date.now()
    let afkTimer: ReturnType<typeof setTimeout> | null = null

    function parkSocket() {
      if (IS_LOCAL_SERVER) return
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      if (rafPending.current !== null) {
        cancelAnimationFrame(rafPending.current)
        rafPending.current = null
      }
      queuedMsgs.current = []
      const ws = wsRef.current
      if (ws) {
        ws.onclose = null
        ws.onmessage = null
        try {
          ws.close()
        } catch {
          /* noop */
        }
        wsRef.current = null
      }
      setConnected(false)
      setIdleParked(true)
    }

    resumeRef.current = () => {
      setIdleParked(false)
      lastInteractionAt = Date.now()
      scheduleAfkCheck()
      reconnectDelayMs = 1000
      bootstrapPendingRef.current = true
      awaitingFullFrameRef.current = true
      connect()
    }

    function scheduleAfkCheck() {
      if (afkTimer !== null) clearTimeout(afkTimer)
      afkTimer = setTimeout(() => {
        if (Date.now() - lastInteractionAt >= IDLE_AFK_MS) parkSocket()
        else scheduleAfkCheck()
      }, IDLE_AFK_MS)
    }
    scheduleAfkCheck()

    function onInteraction() {
      lastInteractionAt = Date.now()
    }
    window.addEventListener('mousemove', onInteraction, { passive: true })
    window.addEventListener('keydown', onInteraction, { passive: true })
    window.addEventListener('pointerdown', onInteraction, { passive: true })

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        if (hiddenTimer !== null) clearTimeout(hiddenTimer)
        hiddenTimer = setTimeout(parkSocket, IDLE_HIDDEN_MS)
        return
      }
      if (hiddenTimer !== null) {
        clearTimeout(hiddenTimer)
        hiddenTimer = null
      }
      lastInteractionAt = Date.now()
      if (idleParkedRef.current) return
      if (rafPending.current !== null) {
        cancelAnimationFrame(rafPending.current)
        rafPending.current = null
      }
      queuedMsgs.current = []
      awaitingFullFrameRef.current = true
      const ws = wsRef.current
      const dead = !ws || ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED
      if (dead) {
        if (reconnectTimer !== null) {
          clearTimeout(reconnectTimer)
          reconnectTimer = null
        }
        reconnectDelayMs = 1000
        connect()
      } else if (ws && ws.readyState === WebSocket.OPEN) {
        requestSnapshotResync(true)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onVisibilityChange)

    return () => {
      destroyed = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', onVisibilityChange)
      window.removeEventListener('mousemove', onInteraction)
      window.removeEventListener('keydown', onInteraction)
      window.removeEventListener('pointerdown', onInteraction)
      if (hiddenTimer !== null) {
        clearTimeout(hiddenTimer)
        hiddenTimer = null
      }
      if (afkTimer !== null) {
        clearTimeout(afkTimer)
        afkTimer = null
      }
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      if (snapshotAbort) {
        snapshotAbort.abort()
        snapshotAbort = null
      }
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
  }, [effectiveSource])

  const requestFromWasm = useCallback(
    (payload: { type: 'command'; json: string } | { type: 'save' }): Promise<boolean> => {
      const worker = wasmWorkerRef.current
      if (!worker) return Promise.resolve(false)
      const requestId = nextWorkerRequestRef.current++
      return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          pendingWorkerRequestsRef.current.delete(requestId)
          resolve(false)
        }, 5000)
        pendingWorkerRequestsRef.current.set(requestId, { resolve, timer })
        worker.postMessage({ ...payload, requestId })
      })
    },
    [],
  )

  const requestDataFromWasm = useCallback(
    <T>(payload: { type: 'org_detail' | 'org_life'; id: string }): Promise<T | null> => {
      const worker = wasmWorkerRef.current
      if (!worker) return Promise.resolve(null)
      const requestId = nextWorkerRequestRef.current++
      return new Promise<string | null>((resolve) => {
        const timer = setTimeout(() => {
          pendingWorkerDataRequestsRef.current.delete(requestId)
          resolve(null)
        }, 5000)
        pendingWorkerDataRequestsRef.current.set(requestId, { resolve, timer })
        worker.postMessage({ ...payload, requestId })
      }).then((json) => {
        if (!json) return null
        try {
          return JSON.parse(json) as T
        } catch (error) {
          logger.warn('wasm', 'invalid local organism data:', error)
          return null
        }
      })
    },
    [],
  )

  const loadLocalOrgDetail = useCallback(
    (id: string) => requestDataFromWasm<OrgDetail>({ type: 'org_detail', id }),
    [requestDataFromWasm],
  )
  const loadLocalOrgLife = useCallback(
    (id: string) => requestDataFromWasm<OrgLife>({ type: 'org_life', id }),
    [requestDataFromWasm],
  )

  const controlDesktopRuntime = useCallback(
    async (control: 'pause' | 'resume' | 'speed', mult?: number): Promise<boolean> => {
      if (!isDesktop()) return false
      try {
        const response = await fetch(`${API_BASE}/runtime`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ control, mult }),
        })
        return response.ok
      } catch {
        return false
      }
    },
    [],
  )

  const saveLocalWorld = useCallback(async (): Promise<boolean> => {
    if (wasmWorkerRef.current) return requestFromWasm({ type: 'save' })
    if (!isDesktop()) return false
    const tick = currentWorldRef.current?.tick ?? 0
    setLocalSaveStatus({ phase: 'saving', tick })
    try {
      const response = await fetch(`${API_BASE}/save`, { method: 'POST' })
      if (!response.ok) throw new Error(`save failed (${response.status})`)
      const result = (await response.json()) as { tick?: number; saved_at?: number }
      setLocalSaveStatus({
        phase: 'saved',
        tick: result.tick ?? tick,
        savedAt: result.saved_at ?? Date.now(),
      })
      return true
    } catch (error) {
      setLocalSaveStatus({
        phase: 'error',
        message: error instanceof Error ? error.message : 'save failed',
      })
      return false
    }
  }, [requestFromWasm])

  const status: ConnectionStatus = connected
    ? 'connected'
    : failedAttempts >= 3
      ? 'unreachable'
      : failedAttempts > 0
        ? 'reconnecting'
        : 'connecting'

  return {
    world,
    connected,
    status,
    failedAttempts,
    interp: {
      prev: prevWorldRef,
      current: currentWorldRef,
      prevServerAt: prevServerAtRef,
      currentServerAt: currentServerAtRef,
      currentReceivedAt: currentReceivedAtRef,
    },
    idleParked,
    resume: () => {
      if (wasmWorkerRef.current) {
        resumeRef.current()
      } else if (isDesktop()) {
        setIdleParked(false)
        void controlDesktopRuntime('resume')
      } else {
        resumeRef.current()
      }
    },
    sandboxAvailable,
    fellBackToLocal: source !== 'wasm' && fellBack,
    localSaveStatus,
    saveLocalWorld,
    loadLocalOrgDetail,
    loadLocalOrgLife,
    sendCommand: async (cmd: SandboxCommand) => {
      if (!sandboxAvailable) return false
      if (effectiveSource === 'wasm') {
        return requestFromWasm({ type: 'command', json: JSON.stringify(cmd) })
      }
      try {
        const res = await fetch(`${API_BASE}/command`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(cmd),
        })
        return res.ok
      } catch {
        return false
      }
    },
    pauseSim: () => {
      if (wasmWorkerRef.current) wasmWorkerRef.current.postMessage({ type: 'pause' })
      else if (isDesktop()) void controlDesktopRuntime('pause')
    },
    setSpeed: (mult: number) => {
      if (wasmWorkerRef.current) {
        wasmWorkerRef.current.postMessage({
          type: 'speed',
          tickMs: Math.max(16, Math.round(WASM_BASE_TICK_MS / mult)),
        })
      } else if (isDesktop()) {
        void controlDesktopRuntime('speed', mult)
      }
    },
  }
}
