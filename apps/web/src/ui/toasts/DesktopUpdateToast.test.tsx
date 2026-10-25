// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopUpdateToast } from './DesktopUpdateToast'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

const roots: Array<{ unmount: () => void }> = []
let listeners: Record<string, (payload: unknown) => void> = {}
let installUpdate: ReturnType<typeof vi.fn>

beforeEach(() => {
  listeners = {}
  installUpdate = vi.fn()
  Object.defineProperty(window, 'thbDesktop', {
    configurable: true,
    value: {
      on: (channel: string, cb: (payload: unknown) => void) => {
        listeners[channel] = cb
        return () => void delete listeners[channel]
      },
      app: { installUpdate },
    },
  })
})
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.replaceChildren()
  delete (window as { thbDesktop?: unknown }).thbDesktop
  vi.restoreAllMocks()
})

function mountReady() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(<DesktopUpdateToast />))
  act(() => listeners['updater:downloaded']({ version: '1.2.3' }))
}

const restartButton = () => document.querySelector('button[title]') as HTMLButtonElement | null
const flush = () =>
  act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })

describe('DesktopUpdateToast install', () => {
  it('shows the message of a deferred install and re-enables the button', async () => {
    installUpdate.mockResolvedValue({ status: 'downloaded', message: 'Finish the save first.' })
    mountReady()
    act(() => restartButton()?.click())
    await flush()
    expect(document.body.textContent).toContain('Finish the save first.')
    expect(restartButton()?.disabled).toBe(false)
  })

  it('keeps the button busy while the app restarts', async () => {
    installUpdate.mockResolvedValue({ status: 'downloaded' })
    mountReady()
    act(() => restartButton()?.click())
    await flush()
    expect(restartButton()?.disabled).toBe(true)
  })
})
