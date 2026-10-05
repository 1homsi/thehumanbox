/**
 * Per-sprite walking state kept in typed arrays, the struct-of-arrays twin of
 * `characterMotion` in character-visuals.ts (same thresholds, same maths), so a
 * crowd costs no object per person per frame. Two stores are swapped on every
 * rebuild so a person's state follows them to their new slot.
 */
export class MotionStore {
  capacity = 0
  lastX = new Float64Array(0)
  lastY = new Float64Array(0)
  movedAt = new Float64Array(0)
  distance = new Float64Array(0)
  flipped = new Uint8Array(0)

  reserve(n: number): void {
    if (n <= this.capacity) return
    const cap = Math.max(n, this.capacity * 2, 64)
    const grow = <T extends Float64Array | Uint8Array>(old: T, make: new (len: number) => T): T => {
      const next = new make(cap)
      next.set(old)
      return next
    }
    this.lastX = grow(this.lastX, Float64Array)
    this.lastY = grow(this.lastY, Float64Array)
    this.movedAt = grow(this.movedAt, Float64Array)
    this.distance = grow(this.distance, Float64Array)
    this.flipped = grow(this.flipped, Uint8Array)
    this.capacity = cap
  }

  /** A sprite seen for the first time at (x, y). */
  init(i: number, x: number, y: number): void {
    this.lastX[i] = x
    this.lastY[i] = y
    this.movedAt[i] = -Infinity
    this.distance[i] = 0
    this.flipped[i] = 0
  }

  copyFrom(from: MotionStore, fromIndex: number, i: number): void {
    this.lastX[i] = from.lastX[fromIndex]
    this.lastY[i] = from.lastY[fromIndex]
    this.movedAt[i] = from.movedAt[fromIndex]
    this.distance[i] = from.distance[fromIndex]
    this.flipped[i] = from.flipped[fromIndex]
  }

  /** `characterMotion` for slot i at (x, y), time `now` (ms). Returns whether it moved. */
  step(i: number, x: number, y: number, now: number): boolean {
    const dx = x - this.lastX[i]
    const dy = y - this.lastY[i]
    const moved = Math.abs(dx) > 0.02 || Math.abs(dy) > 0.02
    if (moved) {
      const d = Math.hypot(dx, dy)
      // Large jumps are placements, not steps.
      if (d < 4) this.distance[i] += d
      this.lastX[i] = x
      this.lastY[i] = y
      this.movedAt[i] = now
    }
    // Only turn on mostly sideways steps.
    if (Math.abs(dx) > 0.02 && Math.abs(dx) >= Math.abs(dy) * 0.5) this.flipped[i] = dx < 0 ? 1 : 0
    return moved
  }

  /** `characterFrame`: standing still shows frame 0, walking cycles by distance. */
  frame(i: number, now: number, phase: number, frames: number): number {
    return now - this.movedAt[i] > 120 ? 0 : Math.floor(this.distance[i] * 4 + phase / 200) % frames
  }
}
