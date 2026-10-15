// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setWorldGPUForTests } from './gpu'
import { useRendererBackend } from './useRendererBackend'

const roots: ReturnType<typeof createRoot>[] = []

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
    let hidden = true
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    })
    const rendered = renderBackend(false)

    act(() => vi.advanceTimersByTime(20_000))
    expect(rendered.backend).toBe('gpu')

    hidden = false
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    act(() => vi.advanceTimersByTime(10_000))
    expect(rendered.backend).toBe('canvas')
  })
})
