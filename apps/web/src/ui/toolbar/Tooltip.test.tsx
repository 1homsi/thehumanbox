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

  it('takes the tip down when the hovered control is replaced under the pointer', () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const under = (id: string) => (
      <Tooltip tip="stats">
        <button key={id} type="button">
          {id}
        </button>
      </Tooltip>
    )
    act(() => root?.render(under('a')))
    const first = host.querySelector('button') as HTMLButtonElement
    act(() => first.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
    expect(document.querySelector('.ui-tooltip')).not.toBeNull()

    // The control the pointer is on is swapped for a new one (its key changes), so no mouseleave ever comes.
    act(() => root?.render(under('b')))

    expect(document.querySelector('.ui-tooltip')).toBeNull()
  })

  it('moves with its control when the page scrolls under it', () => {
    const button = mount()
    const place = (top: number) =>
      ({ top, bottom: top + 20, left: 40, right: 60, width: 20, height: 20, x: 40, y: top }) as DOMRect
    const spy = vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(place(300))
    act(() => button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
    const tip = () => document.querySelector<HTMLElement>('.ui-tooltip')
    expect(tip()?.style.top).toBe('292px')

    // The panel scrolls, so the control is now higher on the screen.
    spy.mockReturnValue(place(150))
    act(() => window.dispatchEvent(new Event('scroll')))

    expect(tip()?.style.top).toBe('142px')
  })
})
