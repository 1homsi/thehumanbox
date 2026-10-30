// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { MapControls } from './MapControls'
import { BUTTON_ZOOM_STEP, buttonZoomTarget, zoomLimitAt, type MapCommand } from './camera-controls'
import { loadLocale, t } from '../../i18n'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

function mount(props: Partial<React.ComponentProps<typeof MapControls>> = {}) {
  const commandRef = { current: null as MapCommand | null }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => root.render(<MapControls commandRef={commandRef} {...props} />))
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
    expect(commandRef.current).toEqual({ kind: 'zoom', factor: BUTTON_ZOOM_STEP, smooth: true })
    act(() => button('Zoom out')!.click())
    expect(commandRef.current).toEqual({ kind: 'zoom', factor: 1 / BUTTON_ZOOM_STEP, smooth: true })
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

describe('zoom limits', () => {
  it('zooms by a step big enough to see', () => {
    expect(BUTTON_ZOOM_STEP).toBeGreaterThanOrEqual(1.5)
  })

  it('builds quick presses on the zoom already heading there, but never zooms the wrong way', () => {
    expect(buttonZoomTarget(1, null, 1.6, 0.2, 8)).toBeCloseTo(1.6)
    // Still easing in towards 2.56: another press in goes on from there.
    expect(buttonZoomTarget(1.4, 2.56, 1.6, 0.2, 8)).toBeCloseTo(4.096)
    // A press out while easing in starts from where the camera is, so it zooms out.
    expect(buttonZoomTarget(1.4, 2.56, 1 / 1.6, 0.2, 8)).toBeCloseTo(0.875)
    expect(buttonZoomTarget(6, 7, 1.6, 0.2, 8)).toBe(8)
  })

  it('names the limit the camera is at', () => {
    expect(zoomLimitAt(8, 0.2, 8)).toBe('max')
    expect(zoomLimitAt(0.2, 0.2, 8)).toBe('min')
    expect(zoomLimitAt(2, 0.2, 8)).toBeNull()
  })

  it('greys out the button for the limit the camera is at', () => {
    const cameraRef = { current: { zoom: 8 } }
    const { button, unmount } = mount({ cameraRef, zoomRange: { min: 0.2, max: 8 } })
    expect(button('Zoom in')!.disabled).toBe(true)
    expect(button('Zoom out')!.disabled).toBe(false)
    unmount()
    const out = mount({ cameraRef: { current: { zoom: 0.2 } }, zoomRange: { min: 0.2, max: 8 } })
    expect(out.button('Zoom in')!.disabled).toBe(false)
    expect(out.button('Zoom out')!.disabled).toBe(true)
    out.unmount()
  })

  it('greys out zoom in as soon as a press heads for the limit, before the camera gets there', () => {
    // 5 x 1.6 = 8: this press reaches the most zoomed-in while the camera is still easing from 5.
    const cameraRef = { current: { zoom: 5 } }
    const { button, unmount } = mount({ cameraRef, zoomRange: { min: 0.2, max: 8 } })
    expect(button('Zoom in')!.disabled).toBe(false)
    act(() => button('Zoom in')!.click())
    expect(button('Zoom in')!.disabled).toBe(true)
    expect(button('Zoom out')!.disabled).toBe(false)
    unmount()
  })

  it('judges by the camera again once the ease is over, so a wheel zoom back out re-enables the button', () => {
    vi.useFakeTimers()
    try {
      const cameraRef = { current: { zoom: 5 } }
      const { button, unmount } = mount({ cameraRef, zoomRange: { min: 0.2, max: 8 } })
      act(() => button('Zoom in')!.click())
      expect(button('Zoom in')!.disabled).toBe(true)
      act(() => vi.advanceTimersByTime(600))
      expect(button('Zoom in')!.disabled).toBe(false)
      unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('MapControls in another language', () => {
  afterEach(async () => {
    await loadLocale('en')
  })

  it('names its buttons in the active language', async () => {
    await loadLocale('de')
    const { button, unmount } = mount({ onLocate: () => undefined })
    expect(button(t('common.zoomIn'))).not.toBeNull()
    expect(button(t('common.zoomOut'))).not.toBeNull()
    expect(button(t('common.fitWorld'))).not.toBeNull()
    expect(button(t('common.centreOnSelected'))).not.toBeNull()
    expect(button('Zoom in')).toBeNull()
    unmount()
  })
})
