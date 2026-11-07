import type { CfDriver, CfFrame } from './frame'

/**
 * Work the drivers may do in one frame before the rest wait for the next (ms). When the terrain or the
 * buildings change, a dozen drivers rebuild together; on a grown world that was one 70-100 ms task, a
 * visible hitch, and a fast-forwarded world did it every second or so. Over the budget, the drivers not
 * yet run this frame run first on the next one, so the work is spread over a few frames instead.
 */
export const DRIVER_BUDGET_MS = 10

/** The drivers of the xipjs layers that are mounted; CfWorld's loop updates them each frame. */
export class CfRegistry {
  private readonly drivers = new Map<string, CfDriver>()
  private order: [string, CfDriver][] | null = null
  /** Index in `order` the next update starts from: the first driver a frame over budget did not reach. */
  private next = 0
  private readonly budgetMs: number
  /** Drivers were left for the next frame: the caller should come back even if nothing else changed. */
  pending = false
  /** Frames that stopped at the budget, for the stats. */
  deferred = 0
  frameMs = 0
  frames = 0
  perDriverMs = new Map<string, number>()

  constructor(budgetMs = DRIVER_BUDGET_MS) {
    this.budgetMs = budgetMs
  }

  add(name: string, driver: CfDriver): () => void {
    this.drivers.set(name, driver)
    this.order = null
    return () => {
      if (this.drivers.get(name) === driver) {
        this.drivers.delete(name)
        this.order = null
      }
    }
  }

  get(name: string): CfDriver | undefined {
    return this.drivers.get(name)
  }

  /**
   * Run the drivers, starting with any a previous frame left over, until they are all done or the frame's
   * budget is spent; true when any layer changed and the engine needs a frame. `pending` says whether some
   * were left for the next call. `budgeted` false runs them all (the first paint of a world).
   */
  update(frame: CfFrame, budgeted = true): boolean {
    let changed = false
    const t0 = performance.now()
    if (this.order === null) {
      this.order = [...this.drivers]
      this.next = 0
    }
    const order = this.order
    const n = order.length
    const start = this.next < n ? this.next : 0
    this.pending = false
    this.next = 0
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n
      // At least one driver runs every frame, so a single slow one still moves on.
      if (budgeted && k > 0 && performance.now() - t0 >= this.budgetMs) {
        this.next = i
        this.pending = true
        this.deferred++
        break
      }
      const [name, d] = order[i]!
      const s = performance.now()
      if (d.update(frame)) changed = true
      this.perDriverMs.set(name, (this.perDriverMs.get(name) ?? 0) + performance.now() - s)
    }
    this.frameMs += performance.now() - t0
    this.frames++
    return changed
  }

  stats(): Record<string, unknown> {
    const out: Record<string, unknown> = { frames: this.frames, ms: this.frameMs, deferred: this.deferred }
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
    this.deferred = 0
    this.perDriverMs.clear()
  }
}
