// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { loadLocale } from '../i18n'
import { ErrorBoundary } from './ErrorBoundary'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
let root: Root | null = null
afterEach(async () => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
  await loadLocale('en')
})

function Broken(): never {
  throw new Error('renderer broke')
}

describe('ErrorBoundary fallback', () => {
  it('says what happened in the language the player chose', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await loadLocale('de')
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() =>
      root?.render(
        <ErrorBoundary>
          <Broken />
        </ErrorBoundary>,
      ),
    )
    const heading = host.querySelector('h1')?.textContent ?? ''
    expect(heading).toBe('Die Welt hat gestockt')
    expect(host.querySelector('button')?.textContent).toBe('Neu laden')
    vi.restoreAllMocks()
  })
})
