// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const reloadAppSafely = vi.fn(() => true)
vi.mock('../simulation/worldSource', () => ({ reloadAppSafely: () => reloadAppSafely() }))

const { loadLocale } = await import('../i18n')
const { WorldCrashedNotice } = await import('./WorldCrashedNotice')

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

function render(detail?: string): HTMLElement {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(<WorldCrashedNotice detail={detail} />))
  return host
}

describe('the world crashed notice', () => {
  it('blocks the map, keeps the panic for bug reports and reloads on click', () => {
    const host = render('the simulation crashed: panicked at tick.rs:10:5')
    expect(host.querySelector('[role="alertdialog"]')).not.toBeNull()
    expect(host.textContent).toContain('The world stopped')
    expect(host.textContent).toContain('panicked at tick.rs:10:5')
    act(() => host.querySelector('button')?.click())
    expect(reloadAppSafely).toHaveBeenCalledOnce()
  })

  it('reads in German', async () => {
    await loadLocale('de')
    const text = render().textContent ?? ''
    expect(text).toContain('Die Welt ist stehen geblieben')
    expect(text).toContain('Neu laden')
  })
})
