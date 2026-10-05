import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { vi } from 'vitest'
import { Game, World, Camera2D } from 'cubeforge'

/**
 * A real cubeforge engine inside happy-dom, for tests of the cf glue.
 *
 * There is no WebGL here, so `getContext('webgl2')` returns a permissive stub
 * (every constant is 1, every call returns an empty object) and `'2d'` a stub
 * that swallows drawing. That is enough for the engine to build its render
 * system and run its frame loop, so the real `useCameraPanZoom`, ECS and
 * scripts execute; only the pixels are missing.
 *
 * Frames are driven by hand: `frame()` runs every queued requestAnimationFrame
 * callback once, advancing a fake clock by `stepMs`.
 */
export interface EngineHarness {
  container: HTMLDivElement
  canvas: () => HTMLCanvasElement
  render: (children: ReactNode, size?: { w: number; h: number }) => Promise<void>
  /** Render something that brings its own `<Game>`. */
  renderRaw: (node: ReactNode) => Promise<void>
  /** Run the queued animation frames `count` times. */
  frame: (count?: number) => Promise<void>
  /** Advance the fake clock without running frames. */
  advance: (ms: number) => void
  now: () => number
  pendingFrames: () => number
  unmount: () => Promise<void>
}

function glStub(): WebGL2RenderingContext {
  const store: Record<string | symbol, unknown> = {}
  return new Proxy(store, {
    get: (t, key) => {
      if (key in t) return t[key]
      if (key === 'isContextLost') return () => false
      if (key === 'getExtension') return () => null
      if (typeof key === 'string' && /^[A-Z0-9_]+$/.test(key)) return 1
      return () => ({})
    },
    set: (t, key, value) => ((t[key] = value), true),
  }) as unknown as WebGL2RenderingContext
}

function ctx2dStub(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const noop = () => ({ addColorStop() {} })
  return new Proxy({ canvas } as Record<string, unknown>, {
    get: (t, key: string) => t[key] ?? noop,
    set: (t, key: string, value) => ((t[key] = value), true),
  }) as unknown as CanvasRenderingContext2D
}

export function engineHarness({
  stepMs = 16,
  dpr = 1,
}: { stepMs?: number; dpr?: number } = {}): EngineHarness {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('devicePixelRatio', dpr)
  // Layout does not exist here: a canvas is as big (in CSS pixels) as the style the engine gave it.
  for (const [prop, style] of [
    ['clientWidth', 'width'],
    ['clientHeight', 'height'],
  ] as const)
    Object.defineProperty(HTMLCanvasElement.prototype, prop, {
      configurable: true,
      get(this: HTMLCanvasElement) {
        return parseFloat(this.style[style]) || 0
      },
    })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
    type: string,
  ) {
    return (type === 'webgl2' ? glStub() : ctx2dStub(this)) as never
  } as never)
  let clock = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  const frames = new Map<number, FrameRequestCallback>()
  let nextId = 0
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    frames.set(++nextId, fn)
    return nextId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const container = document.body.appendChild(document.createElement('div'))
  container.tabIndex = 0
  const root: Root = createRoot(container)
  const tick = async () => {
    await act(async () => {
      const pending = [...frames.values()]
      frames.clear()
      clock += stepMs
      for (const fn of pending) fn(clock)
    })
  }
  return {
    container,
    canvas: () => container.querySelector('canvas')!,
    render: async (children, size = { w: 800, h: 500 }) => {
      await act(async () =>
        root.render(
          <Game width={size.w} height={size.h} mode="onDemand">
            <World>
              <Camera2D />
              {children}
            </World>
          </Game>,
        ),
      )
      // The loop starts once the (empty) asset wait resolves.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    },
    renderRaw: async (node) => {
      await act(async () => root.render(node))
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    },
    frame: async (count = 1) => {
      for (let i = 0; i < count; i++) await tick()
    },
    advance: (ms) => {
      clock += ms
    },
    now: () => clock,
    pendingFrames: () => frames.size,
    unmount: async () => {
      await act(async () => root.unmount())
      container.remove()
      delete (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).clientWidth
      delete (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).clientHeight
      vi.restoreAllMocks()
      vi.unstubAllGlobals()
    },
  }
}

export function pointer(
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  x: number,
  y: number,
  init: { id?: number; button?: number; pointerType?: string } = {},
): Event {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    pointerId: init.id ?? 1,
    pointerType: init.pointerType ?? 'mouse',
    button: init.button ?? 0,
    isPrimary: (init.id ?? 1) === 1,
  })
}

export function wheel(x: number, y: number, deltaY: number, deltaMode = 0): Event {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY, deltaMode })
  // happy-dom drops clientX/clientY from the WheelEvent init.
  Object.defineProperty(event, 'clientX', { value: x })
  Object.defineProperty(event, 'clientY', { value: y })
  return event
}
