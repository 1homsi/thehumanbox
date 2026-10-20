// @vitest-environment happy-dom
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSimulation } from './useSimulation'

const { fetchSnapshot, parsedFrames, mergedFrames } = vi.hoisted(() => ({
  fetchSnapshot: vi.fn(),
  parsedFrames: new Map<string, { frame_id: number; frame_kind: string }>(),
  mergedFrames: [] as number[],
}))

vi.mock('./wire', () => ({
  binaryFramesReady: () => true,
  fetchSnapshotWithProgress: fetchSnapshot,
  loadBinaryFrameDecoder: vi.fn().mockResolvedValue(undefined),
  parseWorldFrame: (raw: string) => {
    const frame = parsedFrames.get(raw)
    if (!frame) return { isErr: () => true, error: { kind: 'json', message: 'unknown frame' } }
    return { isErr: () => false, value: frame }
  },
}))

vi.mock('./merge', () => ({
  mergeFrame: (frame: { frame_id: number; frame_kind: string }) => {
    mergedFrames.push(frame.frame_id)
    return {
      next: { frame_id: frame.frame_id, frame_kind: frame.frame_kind },
      grid: {},
    }
  },
}))

vi.mock('../state/worldStore', () => ({
  useWorldStore: { getState: () => ({ setWorld: vi.fn() }) },
}))

class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static instances: MockWebSocket[] = []
  readyState = MockWebSocket.CONNECTING
  binaryType = ''
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null

  constructor() {
    MockWebSocket.instances.push(this)
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }

  sendFrame(frame: string): void {
    this.onmessage?.({ data: frame })
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED
  }
}

let root: Root
let container: HTMLDivElement
let observedRuntimeState = { paused: false, speed: 1 }
let pauseRuntime: (() => Promise<boolean>) | null = null
const animationFrames = new Map<number, FrameRequestCallback>()
let nextAnimationFrame = 1

function Harness(): null {
  const simulation = useSimulation('native')
  observedRuntimeState = simulation.runtimeState
  pauseRuntime = simulation.pauseSim
  useEffect(() => undefined, [])
  return null
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

async function flushAnimationFrame(): Promise<void> {
  const callbacks = [...animationFrames.values()]
  animationFrames.clear()
  await act(async () => {
    for (const callback of callbacks) callback(performance.now())
    await flushMicrotasks()
  })
}

describe('useSimulation snapshot recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextAnimationFrame++
      animationFrames.set(id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => animationFrames.delete(id))
    MockWebSocket.instances = []
    animationFrames.clear()
    observedRuntimeState = { paused: false, speed: 1 }
    pauseRuntime = null
    mergedFrames.length = 0
    parsedFrames.clear()
    fetchSnapshot.mockReset()
    container = document.createElement('div')
    root = createRoot(container)
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    act(() => root.render(<Harness />))
  })

  afterEach(() => {
    act(() => root.unmount())
    vi.useRealTimers()
    vi.unstubAllGlobals()
    delete window.thbDesktop
    window.history.replaceState({}, '', '/')
    pauseRuntime = null
    container.remove()
  })

  it('does not connect to the fallback port before the desktop runtime URL arrives', () => {
    act(() => root.unmount())
    MockWebSocket.instances = []
    window.history.replaceState({}, '', '?desktop=1')
    window.thbDesktop = { isDesktop: true } as never
    root = createRoot(container)
    act(() => root.render(<Harness />))

    expect(MockWebSocket.instances).toHaveLength(0)
  })

  it('accepts restarted frame ids and retries a failed snapshot with a cached world', async () => {
    parsedFrames.set('initial-snapshot', { frame_id: 10_000, frame_kind: 'full' })
    parsedFrames.set('old-server-frame', { frame_id: 10_001, frame_kind: 'delta' })
    parsedFrames.set('restarted-server-frame', { frame_id: 1, frame_kind: 'delta' })
    fetchSnapshot
      .mockResolvedValueOnce('initial-snapshot')
      .mockResolvedValueOnce(null)
      .mockResolvedValue(null)

    const firstSocket = MockWebSocket.instances[0]
    await act(async () => {
      firstSocket.open()
      await flushMicrotasks()
    })
    await flushAnimationFrame()
    await act(async () => {
      firstSocket.sendFrame('old-server-frame')
    })
    await flushAnimationFrame()
    expect(mergedFrames).toContain(10_001)

    act(() => {
      firstSocket.readyState = MockWebSocket.CLOSED
      firstSocket.onclose?.()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_200)
      await flushMicrotasks()
    })
    const restartedSocket = MockWebSocket.instances[1]
    await act(async () => {
      restartedSocket.open()
      await flushMicrotasks()
    })
    await act(async () => {
      restartedSocket.sendFrame('restarted-server-frame')
      await flushMicrotasks()
    })
    await flushAnimationFrame()

    expect(mergedFrames).toContain(1)
    expect(fetchSnapshot).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_200)
      await flushMicrotasks()
    })
    expect(fetchSnapshot).toHaveBeenCalledTimes(3)
  })

  it('rehydrates desktop runtime state after a websocket reconnect', async () => {
    act(() => root.unmount())
    window.history.replaceState({}, '', '?desktop=1&api=127.0.0.1%3A8000')
    Object.defineProperty(window, 'thbDesktop', { configurable: true, value: { isDesktop: true } })
    const states = [
      { ok: false },
      { ok: true, paused: true, speed: 5 },
      { ok: true, paused: false, speed: 1 },
    ]
    fetchSnapshot.mockResolvedValue(null)
    const runtimeFetch = vi.fn(async () => ({
      ok: true,
      json: async () => states.shift(),
    }))
    vi.stubGlobal('fetch', runtimeFetch)
    root = createRoot(container)
    act(() => root.render(<Harness />))

    expect(observedRuntimeState).toEqual({ paused: false, speed: 1 })
    expect(runtimeFetch).not.toHaveBeenCalled()

    const firstSocket = MockWebSocket.instances.at(-1)!
    await act(async () => {
      firstSocket.open()
      await vi.advanceTimersByTimeAsync(250)
      await flushMicrotasks()
    })
    expect(runtimeFetch).toHaveBeenCalledTimes(2)
    expect(observedRuntimeState).toEqual({ paused: true, speed: 5 })

    act(() => {
      firstSocket.readyState = MockWebSocket.CLOSED
      firstSocket.onclose?.()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_200)
      await flushMicrotasks()
    })
    const restartedSocket = MockWebSocket.instances.at(-1)!
    await act(async () => {
      restartedSocket.open()
      await flushMicrotasks()
    })

    expect(observedRuntimeState).toEqual({ paused: false, speed: 1 })
    expect(runtimeFetch).toHaveBeenCalledTimes(3)
  })

  it('queues a runtime control behind desktop runtime hydration', async () => {
    act(() => root.unmount())
    window.history.replaceState({}, '', '?desktop=1&api=127.0.0.1%3A8000')
    Object.defineProperty(window, 'thbDesktop', { configurable: true, value: { isDesktop: true } })
    fetchSnapshot.mockResolvedValue(null)
    type RuntimeResponse = { ok: boolean; json: () => Promise<unknown> }
    let resolveHydration: ((response: RuntimeResponse) => void) | null = null
    const runtimeFetch = vi.fn((_url: string, init?: RequestInit): Promise<RuntimeResponse> => {
      if (init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, paused: true, speed: 1 }) })
      }
      return new Promise((resolve) => {
        resolveHydration = resolve
      })
    })
    vi.stubGlobal('fetch', runtimeFetch)
    root = createRoot(container)
    act(() => root.render(<Harness />))
    const socket = MockWebSocket.instances.at(-1)!
    await act(async () => {
      socket.open()
      await flushMicrotasks()
    })
    const pendingPause = pauseRuntime!()

    expect(runtimeFetch).toHaveBeenCalledTimes(1)
    expect(runtimeFetch.mock.calls[0]?.[1]?.method).toBeUndefined()
    await act(async () => {
      resolveHydration?.({ ok: true, json: async () => ({ ok: true, paused: false, speed: 1 }) })
      expect(await pendingPause).toBe(true)
    })
    expect(runtimeFetch).toHaveBeenCalledTimes(2)
    expect(runtimeFetch.mock.calls[1]?.[1]?.method).toBe('POST')
    expect(observedRuntimeState).toEqual({ paused: true, speed: 1 })
  })

  it('does not start a second download while the replacement of an aborted snapshot is in flight', async () => {
    // Like the real fetch, an aborted request resolves null.
    const signals: AbortSignal[] = []
    fetchSnapshot.mockImplementation(
      (_url: string, signal: AbortSignal) =>
        new Promise<string | null>((resolve) => {
          signals.push(signal)
          signal.addEventListener('abort', () => resolve(null))
        }),
    )

    const socket = MockWebSocket.instances[0]
    await act(async () => {
      socket.open()
      await flushMicrotasks()
    })
    expect(fetchSnapshot).toHaveBeenCalledTimes(1)

    // Tab returns to the foreground: the forced resync aborts download A and starts B.
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await flushMicrotasks()
    })
    expect(fetchSnapshot).toHaveBeenCalledTimes(2)
    expect(signals[0].aborted).toBe(true)

    // A non-forced request (socket reopen, awaiting-full-frame timer) must see B as pending.
    await act(async () => {
      socket.onopen?.()
      await flushMicrotasks()
    })
    expect(fetchSnapshot).toHaveBeenCalledTimes(2)
  })

  it('does not re-download the snapshot in a loop while the window is hidden', async () => {
    // A hidden window gets no animation frames, so the queue is never drained.
    parsedFrames.set('snapshot', { frame_id: 1, frame_kind: 'full' })
    fetchSnapshot.mockResolvedValue('snapshot')
    const socket = MockWebSocket.instances[0]
    await act(async () => {
      socket.open()
      await flushMicrotasks()
    })
    await flushAnimationFrame()
    expect(fetchSnapshot).toHaveBeenCalledTimes(1)

    let hidden = true
    const spies = [
      vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden),
      vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => (hidden ? 'hidden' : 'visible')),
    ]
    for (let round = 0; round < 10; round += 1) {
      await act(async () => {
        for (let i = 0; i < 40; i += 1) socket.sendFrame('delta')
        await vi.advanceTimersByTimeAsync(300)
        await flushMicrotasks()
      })
    }
    expect(fetchSnapshot).toHaveBeenCalledTimes(1)

    hidden = false
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await flushMicrotasks()
    })
    expect(fetchSnapshot).toHaveBeenCalledTimes(2)
    for (const spy of spies) spy.mockRestore()
  })

  describe('reconnect backoff', () => {
    function dropSocket(socket: MockWebSocket): void {
      act(() => {
        socket.readyState = MockWebSocket.CLOSED
        socket.onclose?.()
      })
    }

    beforeEach(() => {
      vi.spyOn(Math, 'random').mockReturnValue(1)
      fetchSnapshot.mockResolvedValue(null)
    })

    afterEach(() => {
      vi.mocked(Math.random).mockRestore()
    })

    it('keeps backing off when the server accepts the socket and closes it at once', async () => {
      const openAndDrop = async (): Promise<void> => {
        const socket = MockWebSocket.instances[MockWebSocket.instances.length - 1]
        await act(async () => {
          socket.open()
          await flushMicrotasks()
        })
        dropSocket(socket)
      }
      const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

      // The reconnect delay doubles across open/close cycles: 1 s, 2 s, 4 s.
      await openAndDrop()
      await wait(1_000)
      expect(MockWebSocket.instances.length).toBe(2)
      await openAndDrop()
      await wait(1_000)
      expect(MockWebSocket.instances.length).toBe(2)
      await wait(1_000)
      expect(MockWebSocket.instances.length).toBe(3)
      await openAndDrop()
      await wait(3_000)
      expect(MockWebSocket.instances.length).toBe(3)
      await wait(1_000)
      expect(MockWebSocket.instances.length).toBe(4)
    })

    it('resets the backoff once a connection has stayed open', async () => {
      const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
      // Two quick drops raise the next delay to 4 s.
      for (let i = 0; i < 2; i += 1) {
        const socket = MockWebSocket.instances[MockWebSocket.instances.length - 1]
        await act(async () => {
          socket.open()
          await flushMicrotasks()
        })
        dropSocket(socket)
        await wait(i === 0 ? 1_000 : 2_000)
      }
      expect(MockWebSocket.instances.length).toBe(3)
      // A socket that survives past the healthy threshold resets the delay to 1 s.
      const stable = MockWebSocket.instances[2]
      await act(async () => {
        stable.open()
        await vi.advanceTimersByTimeAsync(6_000)
      })
      dropSocket(stable)
      await wait(1_000)
      expect(MockWebSocket.instances.length).toBe(4)
    })
  })
})
