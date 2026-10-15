import { describe, expect, it, vi } from 'vitest'
import { watchForWebGLContextRecovery } from './webglContextRecovery'

describe('WebGL context recovery', () => {
  it('falls back if the restored callback throws', () => {
    const events = new EventTarget()
    const visibility = {
      hidden: false,
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    } as unknown as Document
    const onFailure = vi.fn()
    const recovery = watchForWebGLContextRecovery(
      visibility,
      events as unknown as Element,
      false,
      onFailure,
      () => {
        throw new Error('renderer wake failed')
      },
    )

    events.dispatchEvent(new Event('webglcontextlost'))
    events.dispatchEvent(new Event('webglcontextrestored'))

    expect(onFailure).toHaveBeenCalledOnce()
    recovery.dispose()
  })
})
