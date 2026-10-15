type VisibilitySource = Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>

/** Wait for the first GPU frame only while a frame can be scheduled. */
export function watchForGpuStartupFailure(
  visibility: VisibilitySource,
  initiallyPaused: boolean,
  onFailure: () => void,
  timeoutMs = 10_000,
): { setPaused: (paused: boolean) => void; dispose: () => void } {
  let paused = initiallyPaused
  let timeout: ReturnType<typeof setTimeout> | null = null

  const update = () => {
    if (timeout !== null) clearTimeout(timeout)
    timeout = null
    if (paused || visibility.hidden) return
    timeout = setTimeout(onFailure, timeoutMs)
  }
  const onVisibilityChange = () => update()
  visibility.addEventListener('visibilitychange', onVisibilityChange)
  update()

  return {
    setPaused(nextPaused) {
      paused = nextPaused
      update()
    },
    dispose() {
      visibility.removeEventListener('visibilitychange', onVisibilityChange)
      if (timeout !== null) clearTimeout(timeout)
      timeout = null
    },
  }
}
