type VisibilitySource = Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>
type ContextEventSource = Pick<Element, 'addEventListener' | 'removeEventListener'>

const RESTORE_GRACE_MS = 5_000

/** Fall back only when a lost WebGL context fails to restore while rendering is active. */
export function watchForWebGLContextRecovery(
  visibility: VisibilitySource,
  events: ContextEventSource,
  initiallyPaused: boolean,
  onFailure: () => void,
  onRestored: () => void,
): { setPaused: (paused: boolean) => void; dispose: () => void } {
  let paused = initiallyPaused
  let contextLost = false
  let timeout: ReturnType<typeof setTimeout> | null = null

  const clearTimeoutIfSet = () => {
    if (timeout !== null) clearTimeout(timeout)
    timeout = null
  }
  const updateTimeout = () => {
    clearTimeoutIfSet()
    if (!contextLost || paused || visibility.hidden) return
    timeout = setTimeout(() => {
      timeout = null
      contextLost = false
      onFailure()
    }, RESTORE_GRACE_MS)
  }
  const onContextLost: EventListener = () => {
    contextLost = true
    updateTimeout()
  }
  const onContextRestored: EventListener = () => {
    contextLost = false
    clearTimeoutIfSet()
    try {
      onRestored()
    } catch {
      onFailure()
    }
  }
  const onVisibilityChange = () => updateTimeout()

  events.addEventListener('webglcontextlost', onContextLost, true)
  events.addEventListener('webglcontextrestored', onContextRestored, true)
  visibility.addEventListener('visibilitychange', onVisibilityChange)

  return {
    setPaused(nextPaused) {
      paused = nextPaused
      updateTimeout()
    },
    dispose() {
      events.removeEventListener('webglcontextlost', onContextLost, true)
      events.removeEventListener('webglcontextrestored', onContextRestored, true)
      visibility.removeEventListener('visibilitychange', onVisibilityChange)
      clearTimeoutIfSet()
    },
  }
}
