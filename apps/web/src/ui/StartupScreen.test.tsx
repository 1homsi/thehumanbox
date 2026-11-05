// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const reloadAppSafely = vi.fn(() => true)
vi.mock('../simulation/worldSource', () => ({ reloadAppSafely: () => reloadAppSafely() }))

const { loadLocale } = await import('../i18n')
const { StartupScreen } = await import('./StartupScreen')

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

let root: Root | null = null
afterEach(async () => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
  reloadAppSafely.mockClear()
  await loadLocale('en')
})

function render(props: Parameters<typeof StartupScreen>[0]): HTMLElement {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(<StartupScreen {...props} />))
  return host
}

describe('the startup screen', () => {
  it('reads in English while the web world starts', () => {
    const text = render({ failed: false, desktop: false }).textContent
    expect(text).toContain('starting your world…')
    expect(text).toContain('WebAssembly simulation saved in this browser')
  })

  it('has no English left in German, starting or failed', async () => {
    await loadLocale('de')
    const starting = render({ failed: false, desktop: false }).textContent ?? ''
    expect(starting).toContain('Welt wird gestartet…')
    expect(starting).not.toMatch(/starting|loading/)
    act(() => root?.unmount())
    root = null
    const failed = render({ failed: true, desktop: false }).textContent ?? ''
    expect(failed).toContain('Die lokale Welt konnte nicht starten')
    expect(failed).toContain('Lokale Welt neu starten')
    expect(failed).not.toMatch(/could not|retry/)
  })

  it('names the native simulation in the desktop app', () => {
    expect(render({ failed: false, desktop: true }).textContent).toContain('native simulation')
  })

  it('keeps the worker error for bug reports and retries on click', () => {
    const host = render({ failed: true, desktop: false, detail: 'wasm init failed: out of memory' })
    expect(host.querySelector('.waiting-detail')?.textContent).toBe('wasm init failed: out of memory')
    expect(host.querySelector('.waiting-spinner')).toBeNull()
    act(() => host.querySelector('button')?.click())
    expect(reloadAppSafely).toHaveBeenCalledOnce()
  })
})
