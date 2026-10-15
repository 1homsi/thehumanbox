// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { canUseWorldGPU, setWorldGPUForTests } from '../../render/world-view/gpu'
import { RoomGPUBoundary } from './RoomGPUBoundary'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
afterEach(() => {
  setWorldGPUForTests(null)
  vi.restoreAllMocks()
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
})
