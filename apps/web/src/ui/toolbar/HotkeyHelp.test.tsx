// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { HotkeyHelp } from './HotkeyHelp'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

function mount(onClose: () => void) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => root.render(<HotkeyHelp onClose={onClose} />))
  return () => {
    act(() => root.unmount())
    container.remove()
  }
}

describe('HotkeyHelp', () => {
  it('leaves ? to the app key handler, so one press does not close and reopen it', () => {
    const onClose = vi.fn()
    const unmount = mount(onClose)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }))
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))
    })
    expect(onClose).not.toHaveBeenCalled()
    unmount()
  })

  it('closes on Escape, and on ? when focus is inside the list', () => {
    const onClose = vi.fn()
    const unmount = mount(onClose)
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(onClose).toHaveBeenCalledTimes(1)
    const button = document.querySelector('.hotkey-help-close') as HTMLElement
    act(() => button.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true })))
    expect(onClose).toHaveBeenCalledTimes(2)
    unmount()
  })
})
