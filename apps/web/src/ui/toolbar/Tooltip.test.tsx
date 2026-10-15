// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Tooltip } from './Tooltip'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() =>
    root?.render(
      <Tooltip tip="stats">
        <button type="button">open</button>
      </Tooltip>,
    ),
  )
  return host.querySelector('button') as HTMLButtonElement
}

const press = (key: string) =>
  act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })))

describe('Tooltip on focus', () => {
  it('shows when the player tabs to it', () => {
    const button = mount()
    press('Tab')
    act(() => button.focus())
    expect(document.querySelector('.ui-tooltip')).not.toBeNull()
  })

  it('stays hidden when focus is only handed back after a modal closes, by Escape or a click', () => {
    const button = mount()
    press('Escape')
    act(() => button.focus())
    expect(document.querySelector('.ui-tooltip')).toBeNull()
    act(() => button.blur())
    act(() => void document.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    act(() => button.focus())
    expect(document.querySelector('.ui-tooltip')).toBeNull()
  })

  it('still shows on hover', () => {
    const button = mount()
    act(() => button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
    expect(document.querySelector('.ui-tooltip')).not.toBeNull()
  })
})
