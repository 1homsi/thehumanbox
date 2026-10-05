/**
 * Which cubeforge migrations are live right now. A migration marks itself active only while its
 * renderer is mounted (so the 2D-canvas fallback, which has no cubeforge, keeps every painter),
 * and the canvas pipeline skips the painters whose job has moved.
 */
let active: ReadonlySet<string> = new Set()

export function setCfActive(names: Iterable<string>): void {
  active = new Set(names)
}

export function cfActive(name: string): boolean {
  return active.has(name)
}
