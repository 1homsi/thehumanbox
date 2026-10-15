import type { CfDriver, CfFrame } from './frame'

/**
 * A terrain change rebuilds a lot of static sprites at once. Past this many ms into a step the
 * drivers below that have not run yet wait for the next step (the sprites they hold stay up
 * meanwhile), so one change costs a few short tasks instead of one long one.
 */
export const REBUILD_BUDGET_MS = 6
const SPREADABLE = new Set(['shore', 'patches', 'foam', 'accents', 'waterPlants', 'cattails', 'vegetation'])

/** The drivers of the xipjs layers that are mounted; CfWorld's loop updates them each frame. */
export class CfRegistry {
  private readonly drivers = new Map<string, CfDriver>()
  frameMs = 0
  frames = 0
  perDriverMs = new Map<string, number>()
  /** Drivers put off by the last step: they run first, whatever the budget, in the next. */
  private carried = new Set<string>()
  private carry = new Set<string>()

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
    // The first terrain of a world is built in one go, behind the startup cover; later changes are spread.
    frame.deadline = frame.terrainRevision > 1 ? t0 + REBUILD_BUDGET_MS : Infinity
    this.carry.clear()
    for (const [name, d] of this.drivers) {
      const s = performance.now()
      if (s > frame.deadline && SPREADABLE.has(name) && !this.carried.has(name)) {
        this.carry.add(name)
        continue
      }
      if (d.update(frame)) changed = true
      if (d.pending) this.carry.add(name)
      this.perDriverMs.set(name, (this.perDriverMs.get(name) ?? 0) + performance.now() - s)
    }
    ;[this.carried, this.carry] = [this.carry, this.carried]
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
