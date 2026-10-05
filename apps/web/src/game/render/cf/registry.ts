import type { CfDriver, CfFrame } from './frame'

/** The drivers of the cubeforge layers that are mounted; CfWorld's loop updates them each frame. */
export class CfRegistry {
  private readonly drivers = new Map<string, CfDriver>()
  frameMs = 0
  frames = 0
  perDriverMs = new Map<string, number>()

  add(name: string, driver: CfDriver): () => void {
    this.drivers.set(name, driver)
    return () => {
      if (this.drivers.get(name) === driver) this.drivers.delete(name)
    }
  }

  get(name: string): CfDriver | undefined {
    return this.drivers.get(name)
  }

  /** Run every driver; true when any layer changed and the engine needs a frame. */
  update(frame: CfFrame): boolean {
    let changed = false
    const t0 = performance.now()
    for (const [name, d] of this.drivers) {
      const s = performance.now()
      if (d.update(frame)) changed = true
      this.perDriverMs.set(name, (this.perDriverMs.get(name) ?? 0) + performance.now() - s)
    }
    this.frameMs += performance.now() - t0
    this.frames++
    return changed
  }

  stats(): Record<string, unknown> {
    const out: Record<string, unknown> = { frames: this.frames, ms: this.frameMs }
    for (const [name, ms] of this.perDriverMs) out[`${name}Ms`] = ms
    for (const [name, d] of this.drivers) {
      const s = (d as { stats?: unknown }).stats
      if (s) out[name] = s
    }
    return out
  }

  reset(): void {
    this.frameMs = 0
    this.frames = 0
    this.perDriverMs.clear()
  }
}
