const listeners = new Set<() => void>()

export function onFreshFrameRequest(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function requestFreshFrame(): void {
  for (const listener of listeners) listener()
}
