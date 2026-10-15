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

const focusVisible = (value: boolean) => {
  const matches = Element.prototype.matches
  vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
    return selector === ':focus-visible' ? value : matches.call(this, selector)
  })
}

describe('Tooltip on focus', () => {
  it('shows for keyboard focus', () => {
    focusVisible(true)
    const button = mount()
    act(() => button.focus())
    expect(document.querySelector('.ui-tooltip')).not.toBeNull()
  })

  it('stays hidden when focus is only handed back after a modal closes', () => {
    focusVisible(false)
    const button = mount()
    act(() => button.focus())
    expect(document.querySelector('.ui-tooltip')).toBeNull()
  })

  it('still shows on hover', () => {
    focusVisible(false)
    const button = mount()
    act(() => button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
    expect(document.querySelector('.ui-tooltip')).not.toBeNull()
  })
})
