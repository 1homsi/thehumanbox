// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { MapControls } from './MapControls'
import { KEY_ZOOM_STEP } from './cf/input/camera-rig'
import type { MapCommand } from './camera-controls'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

function mount(props: Partial<React.ComponentProps<typeof MapControls>> = {}) {
  const commandRef = { current: null as MapCommand | null }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() =>
    root.render(<MapControls commandRef={commandRef} {...props} />),
  )
  return {
    commandRef,
    button: (label: string) =>
      document.querySelector<HTMLButtonElement>(`.map-control-btn[aria-label="${label}"]`),
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('MapControls', () => {
  it('zooms in and out through the shared command slot', () => {
    const { commandRef, button, unmount } = mount()
    act(() => button('Zoom in')!.click())
    expect(commandRef.current).toEqual({ kind: 'zoom', factor: KEY_ZOOM_STEP })
    act(() => button('Zoom out')!.click())
    expect(commandRef.current).toEqual({ kind: 'zoom', factor: 1 / KEY_ZOOM_STEP })
    unmount()
  })

  it('fits the world', () => {
    const { commandRef, button, unmount } = mount()
    act(() => button('Fit world')!.click())
    expect(commandRef.current).toEqual({ kind: 'fit' })
    unmount()
  })

  it('shows the locate button only when someone is selected', () => {
    const onLocate = vi.fn()
    const { button, unmount } = mount()
    expect(button('Centre on selected')).toBeNull()
    unmount()

    const withSelection = mount({ onLocate })
    act(() => withSelection.button('Centre on selected')!.click())
    expect(onLocate).toHaveBeenCalledOnce()
    withSelection.unmount()
  })
})
