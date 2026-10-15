// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { CommandPalette } from './CommandPalette'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
})

function mount() {
  const map = document.createElement('div')
  map.className = 'map2d-world'
  map.tabIndex = 0
  const host = document.createElement('div')
  document.body.append(map, host)
  root = createRoot(host)
  act(() => root?.render(<CommandPalette />))
  return map
}

const key = (init: KeyboardEventInit) => act(() => void document.dispatchEvent(new KeyboardEvent('keydown', init)))

describe('CommandPalette focus', () => {
  it('returns focus to the map when it closes, so the map keys keep working', () => {
    const map = mount()
    map.focus()
    key({ key: 'k', ctrlKey: true })
    expect(document.activeElement).toBe(document.querySelector('.cmd-input'))
    key({ key: 'Escape' })
    expect(document.querySelector('.cmd-input')).toBeNull()
    expect(document.activeElement).toBe(map)
  })

  it('falls back to the map when nothing had focus', () => {
    const map = mount()
    key({ key: 'k', metaKey: true })
    key({ key: 'Escape' })
    expect(document.activeElement).toBe(map)
  })

  it('after a command, gives focus back to the map unless the command opened a dialog', async () => {
    const map = mount()
    map.focus()
    key({ key: 'k', ctrlKey: true })
    key({ key: 'Enter' })
    await act(() => new Promise((resolve) => setTimeout(resolve, 40)))
    expect(document.activeElement).toBe(map)

    map.blur()
    key({ key: 'k', ctrlKey: true })
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.append(dialog)
    key({ key: 'Enter' })
    await act(() => new Promise((resolve) => setTimeout(resolve, 40)))
    expect(document.activeElement).not.toBe(map)
  })

  it('leaves focus alone when something else took it', () => {
    const map = mount()
    const other = document.createElement('button')
    document.body.append(other)
    key({ key: 'k', ctrlKey: true })
    other.focus()
    key({ key: 'Escape' })
    expect(document.activeElement).toBe(other)
    expect(document.activeElement).not.toBe(map)
  })
})
