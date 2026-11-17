type Listener = () => void

let missedChunks = 0
const listeners = new Set<Listener>()

export function reportStaleBuild(): void {
  missedChunks += 1
  for (const listener of listeners) listener()
}

export function staleBuildCount(): number {
  return missedChunks
}

export function subscribeStaleBuild(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
