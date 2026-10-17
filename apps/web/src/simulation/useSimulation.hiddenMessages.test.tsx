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
const animationFrames = new Map<number, FrameRequestCallback>()
let nextAnimationFrame = 1
const originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden')
const originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState')

function Harness(): null {
  useSimulation('native')
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

describe('useSimulation hidden websocket messages', () => {
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
    parsedFrames.clear()
    mergedFrames.length = 0
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
    if (originalHidden) Object.defineProperty(document, 'hidden', originalHidden)
    else Reflect.deleteProperty(document, 'hidden')
    if (originalVisibilityState) Object.defineProperty(document, 'visibilityState', originalVisibilityState)
    else Reflect.deleteProperty(document, 'visibilityState')
    container.remove()
  })

  it('drops hidden frames without fetching until visibility returns', async () => {
    parsedFrames.set('initial-snapshot', { frame_id: 1, frame_kind: 'full' })
    fetchSnapshot.mockResolvedValueOnce('initial-snapshot').mockResolvedValue(null)
    const socket = MockWebSocket.instances[0]
    await act(async () => {
      socket.open()
      await flushMicrotasks()
    })
    await flushAnimationFrame()
    expect(fetchSnapshot).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    for (let i = 0; i < 64; i++) {
      act(() => socket.sendFrame(`hidden-${i}`))
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
      await flushMicrotasks()
    })

    expect(fetchSnapshot).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await flushMicrotasks()
    })
    expect(fetchSnapshot).toHaveBeenCalledTimes(2)
  })

  it('keeps a queued bootstrap snapshot when trimming an overflowed queue', async () => {
    parsedFrames.set('bootstrap', { frame_id: 700, frame_kind: 'full' })
    let resolveSnapshot!: (value: string) => void
    fetchSnapshot.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolveSnapshot = resolve
      }),
    )
    const socket = MockWebSocket.instances[0]
    await act(async () => socket.open())

    for (let i = 0; i < 32; i++) {
      const name = `queued-${i}`
      parsedFrames.set(name, { frame_id: 100 + i, frame_kind: 'delta' })
      act(() => socket.sendFrame(name))
    }
    await act(async () => {
      resolveSnapshot('bootstrap')
      await flushMicrotasks()
    })
    parsedFrames.set('overflow', { frame_id: 200, frame_kind: 'delta' })
    act(() => socket.sendFrame('overflow'))
    await flushAnimationFrame()

    expect(mergedFrames).toContain(700)
  })
})
