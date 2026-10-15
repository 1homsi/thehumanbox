// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { setWorldGPUForTests } from './gpu'
import { useRendererBackend } from './useRendererBackend'

const roots: ReturnType<typeof createRoot>[] = []
const restoreVisibility: (() => void)[] = []

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

function stubDocumentHidden(initialValue: boolean) {
  const previous = Object.getOwnPropertyDescriptor(document, 'hidden')
  let hidden = initialValue
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  })
  restoreVisibility.push(() => {
    if (previous) Object.defineProperty(document, 'hidden', previous)
    else Reflect.deleteProperty(document, 'hidden')
  })
  return (value: boolean) => {
    hidden = value
  }
}

function renderBackend(paused: boolean) {
  let backend: ReturnType<typeof useRendererBackend>['renderBackend'] | undefined
  const containerRef = { current: document.createElement('div') }
  function Harness({ rendererPaused }: { rendererPaused: boolean }) {
    backend = useRendererBackend({
      rendererPaused,
      containerRef,
      dims: { w: 100, h: 100 },
    }).renderBackend
    return null
  }

  const root = createRoot(document.createElement('div'))
  roots.push(root)
  act(() => root.render(createElement(Harness, { rendererPaused: paused })))
  return {
    container: containerRef.current,
    get backend() {
      return backend
    },
    setPaused(nextPaused: boolean) {
      act(() => root.render(createElement(Harness, { rendererPaused: nextPaused })))
    },
  }
}

describe('useRendererBackend startup watchdog', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount())
    for (const restore of restoreVisibility.splice(0).reverse()) restore()
    vi.restoreAllMocks()
    setWorldGPUForTests(null)
    vi.useRealTimers()
  })

  it('suspends the failure timeout while the desktop renderer is paused', () => {
    vi.useFakeTimers()
    setWorldGPUForTests(true)
    const rendered = renderBackend(true)

    act(() => vi.advanceTimersByTime(20_000))
    expect(rendered.backend).toBe('gpu')

    rendered.setPaused(false)
    act(() => vi.advanceTimersByTime(10_000))
    expect(rendered.backend).toBe('canvas')
  })

  it('suspends the failure timeout while the document is hidden', () => {
    vi.useFakeTimers()
    setWorldGPUForTests(true)
    const setHidden = stubDocumentHidden(true)
    const rendered = renderBackend(false)

    act(() => vi.advanceTimersByTime(20_000))
    expect(rendered.backend).toBe('gpu')

    setHidden(false)
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    act(() => vi.advanceTimersByTime(10_000))
    expect(rendered.backend).toBe('canvas')
  })

  it('keeps the GPU backend when WebGL restores within the grace period', () => {
    vi.useFakeTimers()
    setWorldGPUForTests(true)
    const rendered = renderBackend(false)

    act(() => rendered.container.dispatchEvent(new Event('webglcontextlost')))
    act(() => vi.advanceTimersByTime(4_000))
    act(() => rendered.container.dispatchEvent(new Event('webglcontextrestored')))
    act(() => vi.advanceTimersByTime(1_000))

    expect(rendered.backend).toBe('gpu')
  })

  it('falls back when a lost WebGL context does not restore while visible', () => {
    vi.useFakeTimers()
    setWorldGPUForTests(true)
    const rendered = renderBackend(false)

    act(() => rendered.container.dispatchEvent(new Event('webglcontextlost')))
    act(() => vi.advanceTimersByTime(5_000))

    expect(rendered.backend).toBe('canvas')
  })

  it('does not time out a lost context while the tab is hidden', () => {
    vi.useFakeTimers()
    setWorldGPUForTests(true)
    const setHidden = stubDocumentHidden(true)
    const rendered = renderBackend(false)

    act(() => rendered.container.dispatchEvent(new Event('webglcontextlost')))
    act(() => vi.advanceTimersByTime(10_000))
    expect(rendered.backend).toBe('gpu')

    setHidden(false)
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    act(() => vi.advanceTimersByTime(5_000))
    expect(rendered.backend).toBe('canvas')
  })

  it('does not time out a lost context while the desktop renderer is paused', () => {
    vi.useFakeTimers()
    setWorldGPUForTests(true)
    const rendered = renderBackend(true)

    act(() => rendered.container.dispatchEvent(new Event('webglcontextlost')))
    act(() => vi.advanceTimersByTime(10_000))
    expect(rendered.backend).toBe('gpu')

    rendered.setPaused(false)
    act(() => vi.advanceTimersByTime(5_000))
    expect(rendered.backend).toBe('canvas')
  })
})
