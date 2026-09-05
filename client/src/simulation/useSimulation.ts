import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorldState, GridState, OrganismState, AnimalState, OrgDetail, OrgLife } from '../types'
import { WS_BASE, API_BASE, IS_LOCAL_SERVER } from '../lib/config'
import { useWorldStore } from '../stores/worldStore'
import { fetchSnapshotWithProgress, parseWorldFrame } from './wire'
import { mergeFrame, type MergeCaches } from './merge'
import { updateOrgMotion, updateAnimalMotion } from '../3d/world/parts/motion-state'
import { logger } from '../lib/logger'
import {
  type LocalWorldReloadDetail,
  type WorldSource,
  LOCAL_WORLD_CHECKPOINT_EVENT,
  LOCAL_WORLD_RELOAD_EVENT,
  OWN_WORLD_ID,
  clearOwnWorldRecoveryRequest,
  clearOwnWorldResetRequest,
  getOwnWorldSeed,
  getOwnWorldRecoveryRequest,
  hasOwnWorldResetRequest,
} from './worldSource'
import { canSendSandboxCommand, type SandboxCommand } from './sandbox'
import { isDesktop } from '../lib/desktop'
import { localSaveWorkerRequest } from './wasmPersistence'
import {
  fetchRuntimeControlState,
  WASM_BASE_TICK_MS,
  wasmSpeedConfig,
  nextRuntimeState,
  reconcileRuntimeState,
  type RuntimeControl,
  type RuntimeControlResult,
  type RuntimeState,
} from './runtimeControls'

const RELOAD_CHECKPOINT_DEADLINE_MS = 6_000
const RELOAD_CHECKPOINT_TIMEOUT_MS = 7_000

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
  | { phase: 'retrying'; tick: number }
  | { phase: 'saving'; tick: number }
  | { phase: 'saved'; tick: number; savedAt: number }
  | { phase: 'error'; message: string; retryable?: boolean; fatal?: boolean }

export function useSimulation(source: WorldSource = 'native'): {
  world: WorldState | null
  connected: boolean
  status: ConnectionStatus
  failedAttempts: number
  interp: InterpRefs
  idleParked: boolean
  resume: () => Promise<boolean>
  sandboxAvailable: boolean
  sendCommand: (cmd: SandboxCommand) => Promise<boolean>
  pauseSim: () => Promise<boolean>
  setSpeed: (mult: number) => Promise<boolean>
  runtimeState: RuntimeState
  localSaveStatus: LocalSaveStatus
  saveLocalWorld: () => Promise<boolean>
  loadLocalOrgDetail: (id: string) => Promise<OrgDetail | null>
  loadLocalOrgLife: (id: string) => Promise<OrgLife | null>
} {
  const [world, setWorld] = useState<WorldState | null>(null)
  const [connected, setConnected] = useState(false)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [idleParked, setIdleParked] = useState(false)
  const [runtimeState, setRuntimeState] = useState<RuntimeState>({ paused: false, speed: 1 })
  const [localSaveStatus, setLocalSaveStatus] = useState<LocalSaveStatus>(
    source === 'wasm' ? { phase: 'loading' } : { phase: 'inactive' },
  )
  const effectiveSource = source
  const sandboxAvailable = canSendSandboxCommand(effectiveSource, isDesktop(), IS_LOCAL_SERVER)
  const wsRef = useRef<WebSocket | null>(null)
  const wasmWorkerRef = useRef<Worker | null>(null)
  const runtimeControlQueueRef = useRef<Promise<void>>(Promise.resolve())
  const runtimeSourceGenerationRef = useRef(0)
  const nextWorkerRequestRef = useRef(1)
  const pendingWorkerRequestsRef = useRef(
    new Map<
      number,
      { resolve: (result: RuntimeControlResult) => void; timer: ReturnType<typeof setTimeout> }
    >(),
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
    runtimeSourceGenerationRef.current += 1
    runtimeControlQueueRef.current = Promise.resolve()
    setRuntimeState({ paused: false, speed: 1 })
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
      let workerFailed = false
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
          retryable?: boolean
          fatal?: boolean
          paused?: boolean
          tickMs?: number
          speed?: number
        }
        if (m.type === 'frame' && typeof m.frame === 'string') {
          if (!announced) {
            announced = true
            setConnected(true)
          }
          enqueueMessage(m.frame)
        } else if (m.type === 'ready' || m.type === 'storage_ready') {
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
        } else if (m.type === 'recovery_done') {
          clearOwnWorldRecoveryRequest()
        } else if (m.type === 'recovery_cancelled') {
          clearOwnWorldRecoveryRequest()
        } else if (m.type === 'storage_retrying') {
          setLocalSaveStatus({ phase: 'retrying', tick: m.tick ?? 0 })
        } else if (m.type === 'saving') {
          setLocalSaveStatus({ phase: 'saving', tick: m.tick ?? 0 })
        } else if (m.type === 'saved') {
          setLocalSaveStatus({ phase: 'saved', tick: m.tick ?? 0, savedAt: m.savedAt ?? Date.now() })
        } else if (
          (m.type === 'command_result' ||
            m.type === 'save_result' ||
            m.type === 'storage_retry_result' ||
            m.type === 'reload_result' ||
            m.type === 'runtime_result') &&
          m.requestId !== undefined
        ) {
          const pending = pendingWorkerRequests.get(m.requestId)
          if (pending) {
            clearTimeout(pending.timer)
            pendingWorkerRequests.delete(m.requestId)
            pending.resolve({
              ok: m.ok === true,
              paused: typeof m.paused === 'boolean' ? m.paused : undefined,
              speed:
                typeof m.speed === 'number' && Number.isFinite(m.speed) && m.speed > 0
                  ? m.speed
                  : typeof m.tickMs === 'number' && Number.isFinite(m.tickMs) && m.tickMs > 0
                    ? WASM_BASE_TICK_MS / m.tickMs
                    : undefined,
            })
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
          workerFailed ||= m.fatal === true
          if (workerFailed) setConnected(false)
          setLocalSaveStatus({
            phase: 'error',
            message: m.message,
            retryable: m.retryable === true,
            fatal: workerFailed,
          })
        }
      }
      worker.onerror = (e: ErrorEvent) => {
        if (destroyed) return
        workerFailed = true
        setConnected(false)
        logger.warn('wasm', 'worker error:', e.message)
        setLocalSaveStatus({
          phase: 'error',
          fatal: true,
          message: e.message || 'the local simulation worker stopped unexpectedly',
        })
      }
      worker.postMessage({
        type: 'start',
        id: OWN_WORLD_ID,
        seed: getOwnWorldSeed(),
        reset: hasOwnWorldResetRequest(),
        recoveryId: getOwnWorldRecoveryRequest(),
      })

      const checkpointWorker = (): Promise<boolean> => {
        const requestId = nextWorkerRequestRef.current++
        return new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => {
            pendingWorkerRequests.delete(requestId)
            resolve(false)
          }, 7_000)
          pendingWorkerRequests.set(requestId, { resolve: (result) => resolve(result.ok), timer })
          worker.postMessage({ type: 'save', requestId })
        })
      }
      let reloadPreparation: Promise<boolean> | null = null
      const prepareWorkerReload = (): Promise<boolean> => {
        if (reloadPreparation) return reloadPreparation
        const requestId = nextWorkerRequestRef.current++
        const deadlineAt = Date.now() + RELOAD_CHECKPOINT_DEADLINE_MS
        const preparation = new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => {
            pendingWorkerRequests.delete(requestId)
            resolve(false)
          }, RELOAD_CHECKPOINT_TIMEOUT_MS)
          pendingWorkerRequests.set(requestId, { resolve: (result) => resolve(result.ok), timer })
          worker.postMessage({ type: 'prepare_reload', requestId, deadlineAt })
        })
        reloadPreparation = preparation
        void preparation.then((ok) => {
          if (!ok && reloadPreparation === preparation) reloadPreparation = null
        })
        return preparation
      }
      const onCheckpointRequest = (event: Event) => {
        const request = event as CustomEvent<{ resolve?: (ok: boolean) => void }>
        if (typeof request.detail?.resolve !== 'function') return
        event.preventDefault()
        if (workerFailed) {
          request.detail.resolve(false)
          return
        }
        void checkpointWorker().then(request.detail.resolve)
      }
      const onSafeReloadRequest = (event: Event) => {
        const request = event as CustomEvent<LocalWorldReloadDetail>
        event.preventDefault()
        // No in-memory world remains after a fatal worker failure, so there is
        // nothing left to checkpoint. Reload the last durable save directly
        // instead of trapping every retry behind a request the worker cannot
        // answer.
        if (workerFailed) {
          window.location.reload()
          return
        }
        void prepareWorkerReload().then((ok) => {
          if (ok) {
            window.location.reload()
          } else {
            request.detail?.onFailure?.()
            setLocalSaveStatus({
              phase: 'error',
              retryable: true,
              message:
                request.detail?.failureMessage ??
                'could not checkpoint the current world; refresh was cancelled safely',
            })
          }
        })
      }
      window.addEventListener(LOCAL_WORLD_CHECKPOINT_EVENT, onCheckpointRequest)
      window.addEventListener(LOCAL_WORLD_RELOAD_EVENT, onSafeReloadRequest)

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
        window.removeEventListener(LOCAL_WORLD_CHECKPOINT_EVENT, onCheckpointRequest)
        window.removeEventListener(LOCAL_WORLD_RELOAD_EVENT, onSafeReloadRequest)
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
          pending.resolve({ ok: false })
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
    const runtimeHydrationAbort = new AbortController()
    if (isDesktop()) {
      const hydrateRuntimeState = async (): Promise<void> => {
        const result = await fetchRuntimeControlState(`${API_BASE}/runtime`, {
          signal: runtimeHydrationAbort.signal,
        })
        if (!destroyed) setRuntimeState((current) => reconcileRuntimeState(current, result))
      }
      runtimeControlQueueRef.current = hydrateRuntimeState()
    }

    let reconnectDelayMs = 1000
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let attempts = 0

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
        scheduleReconnect()
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
      runtimeHydrationAbort.abort()
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
    (
      payload:
        | { type: 'command'; json: string }
        | { type: 'save' }
        | { type: 'retry_storage' }
        | { type: 'pause' }
        | { type: 'resume' }
        | { type: 'speed'; tickMs: number; stepsPerEmit: number; speed: number },
    ): Promise<boolean> => {
      const worker = wasmWorkerRef.current
      if (!worker) return Promise.resolve(false)
      const requestId = nextWorkerRequestRef.current++
      return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          pendingWorkerRequestsRef.current.delete(requestId)
          resolve(false)
        }, 5000)
        pendingWorkerRequestsRef.current.set(requestId, {
          resolve: (result) => resolve(result.ok),
          timer,
        })
        worker.postMessage({ ...payload, requestId })
      })
    },
    [],
  )

  const requestRuntimeFromWasm = useCallback(
    (
      payload:
        | { type: 'pause' }
        | { type: 'resume' }
        | { type: 'speed'; tickMs: number; stepsPerEmit: number; speed: number },
    ): Promise<RuntimeControlResult> => {
      const worker = wasmWorkerRef.current
      if (!worker) return Promise.resolve({ ok: false })
      const requestId = nextWorkerRequestRef.current++
      return new Promise<RuntimeControlResult>((resolve) => {
        const timer = setTimeout(() => {
          pendingWorkerRequestsRef.current.delete(requestId)
          resolve({ ok: false })
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
    async (control: RuntimeControl, mult?: number): Promise<RuntimeControlResult> => {
      if (!isDesktop()) return { ok: false }
      return fetchRuntimeControlState(`${API_BASE}/runtime`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ control, mult }),
      })
    },
    [],
  )

  const applyRuntimeControl = useCallback(
    (control: RuntimeControl, mult?: number): Promise<boolean> => {
      const sourceGeneration = runtimeSourceGenerationRef.current
      const run = async (): Promise<boolean> => {
        if (sourceGeneration !== runtimeSourceGenerationRef.current) return false
        let result: RuntimeControlResult
        if (wasmWorkerRef.current) {
          if (control === 'pause') result = await requestRuntimeFromWasm({ type: 'pause' })
          else if (control === 'resume') result = await requestRuntimeFromWasm({ type: 'resume' })
          else if (typeof mult === 'number' && Number.isFinite(mult) && mult > 0) {
            const speed = wasmSpeedConfig(mult)
            result = speed ? await requestRuntimeFromWasm({ type: 'speed', ...speed }) : { ok: false }
          } else {
            result = { ok: false }
          }
        } else if (isDesktop()) {
          result = await controlDesktopRuntime(control, mult)
        } else if (control === 'resume') {
          resumeRef.current()
          result = { ok: true, paused: false }
        } else {
          result = { ok: false }
        }

        if (!result.ok || sourceGeneration !== runtimeSourceGenerationRef.current) return false
        if (control === 'resume') setIdleParked(false)
        setRuntimeState((current) => nextRuntimeState(current, control, mult, result))
        return true
      }

      const pending = runtimeControlQueueRef.current.then(run, run)
      runtimeControlQueueRef.current = pending.then(
        () => undefined,
        () => undefined,
      )
      return pending
    },
    [controlDesktopRuntime, requestRuntimeFromWasm],
  )

  const resume = useCallback(() => applyRuntimeControl('resume'), [applyRuntimeControl])
  const pauseSim = useCallback(() => applyRuntimeControl('pause'), [applyRuntimeControl])
  const setSpeed = useCallback((mult: number) => applyRuntimeControl('speed', mult), [applyRuntimeControl])

  const saveLocalWorld = useCallback(async (): Promise<boolean> => {
    if (wasmWorkerRef.current) {
      return requestFromWasm({ type: localSaveWorkerRequest(localSaveStatus) })
    }
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
  }, [localSaveStatus, requestFromWasm])

  const status: ConnectionStatus = connected
    ? 'connected'
    : failedAttempts >= 3
      ? 'unreachable'
      : failedAttempts > 0
        ? 'reconnecting'
        : 'connecting'

  // A fresh object here would change identity on every publish, and the
  // 2D renderer's rAF effect depends on it - restarting that loop (and
  // redoing per-frame setup) twice a second for no reason.
  const interpRef = useRef<InterpRefs | null>(null)
  if (interpRef.current === null) {
    interpRef.current = {
      prev: prevWorldRef,
      current: currentWorldRef,
      prevServerAt: prevServerAtRef,
      currentServerAt: currentServerAtRef,
      currentReceivedAt: currentReceivedAtRef,
    }
  }

  return {
    world,
    connected,
    status,
    failedAttempts,
    interp: interpRef.current,
    idleParked,
    resume,
    sandboxAvailable,
    runtimeState,
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
    pauseSim,
    setSpeed,
  }
}
