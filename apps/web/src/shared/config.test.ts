// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'

describe('desktop command token', () => {
  it('keeps the token for sandbox headers and removes it from the renderer URL', async () => {
    vi.resetModules()
    window.history.replaceState(
      window.history.state,
      '',
      '/index.html?desktop=1&api=127.0.0.1%3A8000&token=secret#map',
    )
    Object.defineProperty(window, 'thbDesktop', { configurable: true, value: {} })

    const { sandboxHeaders } = await import('./config')

    expect(sandboxHeaders()).toEqual({ 'x-thb-token': 'secret' })
    expect(window.location.search).toContain('desktop=1')
    expect(window.location.search).toContain('api=127.0.0.1%3A8000')
    expect(window.location.search).not.toContain('token=')
    expect(window.location.hash).toBe('#map')
  })
})
