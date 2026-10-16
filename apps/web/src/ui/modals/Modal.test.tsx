// @vitest-environment happy-dom
import { act, useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
const roots: Array<{ unmount: () => void }> = []
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
})

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button id="trigger" onClick={() => setOpen(true)}>
        open
      </button>
      <Modal open={open} onClose={() => setOpen(false)} className="stats-modal" title="Stats" hideTitle>
        <p>body text</p>
        <button id="inner">inner</button>
      </Modal>
    </>
  )
}

function mount(element: ReactElement) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(element))
  return host
}

describe('Modal', () => {
  it('moves keyboard focus into the dialog when it opens', () => {
    const host = mount(<Harness />)
    const trigger = host.querySelector<HTMLButtonElement>('#trigger')!
    act(() => trigger.focus())
    act(() => trigger.click())
    const dialog = document.querySelector('.thb-modal')!
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(trigger)
  })

  it('keeps an autoFocus control inside the dialog focused', () => {
    function WithAutoFocus() {
      const [open, setOpen] = useState(true)
      return (
        <Modal open={open} onClose={() => setOpen(false)} className="confirm-modal" title="Sure?">
          <button id="confirm" autoFocus>
            ok
          </button>
        </Modal>
      )
    }
    mount(<WithAutoFocus />)
    expect(document.activeElement?.id).toBe('confirm')
  })
})
