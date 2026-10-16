// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { canUseWorldGPU, markWorldGPUFailed, setWorldGPUForTests } from '../../render/world-view/gpu'
import { RoomGPUBoundary } from './RoomGPUBoundary'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
afterEach(() => {
  setWorldGPUForTests(null)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function Boom(): never {
  throw new Error('gpu room crashed')
}

describe('RoomGPUBoundary', () => {
  it('shows the 2D fallback and keeps later interiors off the failed GPU', () => {
    setWorldGPUForTests(true)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() =>
      root.render(
        <RoomGPUBoundary fallback={<i>2d</i>}>
          <Boom />
        </RoomGPUBoundary>,
      ),
    )

    expect(container.textContent).toBe('2d')
    expect(canUseWorldGPU()).toBe(false)
    act(() => root.unmount())
  })

  it('switches a mounted interior to the 2D canvas when its context never restores', () => {
    setWorldGPUForTests(true)
    const container = document.createElement('div')
    const root = createRoot(container)
    vi.useFakeTimers()

    act(() =>
      root.render(
        <RoomGPUBoundary fallback={<i>2d</i>}>
          <canvas />
        </RoomGPUBoundary>,
      ),
    )
    expect(container.textContent).toBe('')

    const canvas = container.querySelector('canvas')!
    act(() => canvas.dispatchEvent(new Event('webglcontextlost')))
    act(() => vi.advanceTimersByTime(5_000))

    expect(container.textContent).toBe('2d')
    expect(canUseWorldGPU()).toBe(false)
    act(() => root.unmount())
  })

  it('keeps the GPU interior when the context restores within the grace period', () => {
    setWorldGPUForTests(true)
    const container = document.createElement('div')
    const root = createRoot(container)
    vi.useFakeTimers()

    act(() =>
      root.render(
        <RoomGPUBoundary fallback={<i>2d</i>}>
          <canvas />
        </RoomGPUBoundary>,
      ),
    )
    const canvas = container.querySelector('canvas')!
    act(() => canvas.dispatchEvent(new Event('webglcontextlost')))
    act(() => vi.advanceTimersByTime(1_000))
    act(() => canvas.dispatchEvent(new Event('webglcontextrestored')))
    act(() => vi.advanceTimersByTime(10_000))

    expect(container.textContent).toBe('')
    expect(canUseWorldGPU()).toBe(true)
    act(() => root.unmount())
  })

  it('falls back when the GPU is marked failed while the interior is mounted', () => {
    setWorldGPUForTests(true)
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() =>
      root.render(
        <RoomGPUBoundary fallback={<i>2d</i>}>
          <canvas />
        </RoomGPUBoundary>,
      ),
    )
    expect(container.textContent).toBe('')

    act(() => markWorldGPUFailed())

    expect(container.textContent).toBe('2d')
    act(() => root.unmount())
  })
})
