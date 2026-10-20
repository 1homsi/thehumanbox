// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { canUseFullscreen, toggleElementFullscreen } from './fullscreen'

const el = document.documentElement as unknown as Record<string, unknown>

afterEach(() => {
  Reflect.deleteProperty(el, 'requestFullscreen')
})

describe('fullscreen support', () => {
  it('is unsupported where requestFullscreen is missing (iPhone Safari)', () => {
    expect(canUseFullscreen()).toBe(false)
  })

  it('is supported when the element can go fullscreen', () => {
    el.requestFullscreen = () => Promise.resolve()
    expect(canUseFullscreen()).toBe(true)
  })
})

describe('toggleElementFullscreen', () => {
  it('resolves false instead of throwing when unsupported', async () => {
    await expect(toggleElementFullscreen()).resolves.toBe(false)
  })

  it('requests fullscreen and reports it on', async () => {
    const request = vi.fn(() => Promise.resolve())
    el.requestFullscreen = request
    await expect(toggleElementFullscreen()).resolves.toBe(true)
    expect(request).toHaveBeenCalledOnce()
  })

  it('reports off when the request is rejected', async () => {
    el.requestFullscreen = () => Promise.reject(new Error('denied'))
    await expect(toggleElementFullscreen()).resolves.toBe(false)
  })
})
