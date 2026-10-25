// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { WorldToolSearch } from './WorldToolSearch'
import { searchWorldTools } from './tool-search'

beforeAll(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  // happy-dom has no modal dialogs; the component only needs the dialog to report it is open.
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open')
  }
})
afterAll(() => vi.unstubAllGlobals())

let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
})

describe('WorldToolSearch while an IME composes', () => {
  it('an Enter that commits a composed word does not pick the one tool it finds', () => {
    // The query names exactly one tool; a plain Enter on that result picks it.
    const query = 'polar_bear'
    expect(searchWorldTools(query)).toHaveLength(1)

    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onPick = vi.fn()
    act(() => root?.render(<WorldToolSearch open onClose={() => {}} onPick={onPick} />))

    const input = document.querySelector<HTMLInputElement>('.world-tool-search input')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, query)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))
    })
    expect(onPick).not.toHaveBeenCalled()

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onPick).toHaveBeenCalledTimes(1)
  })
})
