// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { loadLocale } from '../i18n'
import { ErrorBoundary } from './ErrorBoundary'

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }))
vi.mock('../shared/observability', () => ({ captureException }))

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
  it('reports the error and its component stack to error tracking', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    captureException.mockClear()
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
    expect(captureException).toHaveBeenCalledOnce()
    const [error, props] = captureException.mock.calls[0] as [Error, Record<string, unknown>]
    expect(error.message).toBe('renderer broke')
    expect(props.source).toBe('error_boundary')
    expect(String(props.component_stack)).toContain('Broken')
    vi.restoreAllMocks()
  })

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
