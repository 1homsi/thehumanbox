/** How long a label takes to fade in once it is wanted. */
export const LABEL_FADE_IN_MS = 180
/** How long a label that is no longer wanted takes to fade out. */
export const LABEL_FADE_OUT_MS = 240
/** A paint that comes long after the last one (a pause, a background tab) counts as this long. */
const MAX_STEP_MS = 100
const EPSILON = 1e-6

interface Entry<T> {
  alpha: number
  data: T
  /** The paint in which the label was last asked about. */
  visited: number
}

/**
 * Each label's opacity from one paint to the next. A label that is wanted fades in; one that is not fades out where
 * it was last drawn, so a name that is thinned out, pushed aside by a neighbour or walks off screen goes away smoothly
 * instead of popping. The data a label was last wanted with is kept for that fade (`dataOf`), so it can stay put
 * while it fades.
 *
 * Use it as: `begin(now)`, then `set` for every label a paint asks about, then `leaving` for the rest.
 */
export class LabelPresence<T> {
  private readonly entries = new Map<string, Entry<T>>()
  private paintAt = 0
  /** Milliseconds since the last paint, as the fade moves by. */
  private step = 0
  /** Counts paints; a label's `visited` is the paint it was last asked about. */
  private paint = 0
  /** Whether a label was part-way through a fade after the last paint. A caller repaints sooner while it is. */
  fading = false

  /** Start a paint at wall-clock `now`. */
  begin(now: number): void {
    this.step = this.paint === 0 ? 0 : Math.min(MAX_STEP_MS, Math.max(0, now - this.paintAt))
    this.paintAt = now
    this.paint++
    this.fading = false
  }

  /** Forget every label (nothing is drawn, so nothing is left to fade). */
  clear(): void {
    this.entries.clear()
    this.fading = false
  }

  /**
   * Whether `key` is shown after the last paint (its opacity was above a half). Read this before the paint's `set`
   * calls, so the answer is the one from the paint before.
   */
  visible(key: string): boolean {
    const entry = this.entries.get(key)
    return entry !== undefined && entry.alpha >= 0.5
  }

  /** The data `key` was last wanted with, while it is still around (fading or shown). */
  dataOf(key: string): T | undefined {
    return this.entries.get(key)?.data
  }

  /**
   * Whether `key` is wanted in this paint, and with what data. Returns its opacity for this paint: 0 when it is not
   * drawn. A label that is not wanted but still fading keeps its last data.
   */
  set(key: string, wanted: boolean, data?: T): number {
    let entry = this.entries.get(key)
    if (!entry) {
      if (!wanted || data === undefined) return 0
      entry = { alpha: 0, data, visited: this.paint }
      this.entries.set(key, entry)
    }
    entry.visited = this.paint
    if (wanted && data !== undefined) entry.data = data
    this.move(entry, wanted)
    if (!wanted && entry.alpha === 0) this.entries.delete(key)
    return entry.alpha
  }

  /** After the paint's `set` calls: every label that was not asked about fades out where it was, and is yielded. */
  leaving(visit: (key: string, data: T, alpha: number) => void): void {
    for (const [key, entry] of this.entries) {
      if (entry.visited === this.paint) continue
      this.move(entry, false)
      if (entry.alpha === 0) {
        this.entries.delete(key)
        continue
      }
      visit(key, entry.data, entry.alpha)
    }
  }

  private move(entry: Entry<T>, wanted: boolean): void {
    const delta = this.step / (wanted ? LABEL_FADE_IN_MS : LABEL_FADE_OUT_MS)
    const next = Math.min(1, Math.max(0, entry.alpha + (wanted ? delta : -delta)))
    // Rounding error must not leave a finished fade just short of its end.
    entry.alpha = next > 1 - EPSILON ? 1 : next < EPSILON ? 0 : next
    if (entry.alpha < 1 && (wanted || entry.alpha > 0)) this.fading = true
  }
}
