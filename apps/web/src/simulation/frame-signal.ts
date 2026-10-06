/**
 * "A new simulation frame has been merged." The map's render loops sleep while the world is
 * still; this is what wakes them, without them polling the frame refs sixty times a second.
 */
const listeners = new Set<() => void>()

export function onSimFrame(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function signalSimFrame(): void {
  for (const listener of listeners) listener()
}
