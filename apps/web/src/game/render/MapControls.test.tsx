// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { MapControls } from './MapControls'
import { BUTTON_ZOOM_STEP, zoomLimitAt, type MapCommand } from './camera-controls'
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
