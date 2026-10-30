/** Most placements one drag can make. A drag is a line of tools, not a way to spawn a crowd. */
export const MAX_PLACEMENTS_PER_DRAG = 40

/** The largest brush setting the toolbar can reach (see App's brush clamp). */
const MAX_BRUSH = 20

/**
 * Tiles between two placements in a drag. A brush of `n` is drawn `n + 1` tiles across
 * (the brush sizes read 1, 2, 3, 5 tiles), so placements at this spacing just touch.
 */
export function placementSpacing(brush: number): number {
  const size = Number.isFinite(brush) ? Math.round(Math.min(MAX_BRUSH, Math.max(0, brush))) : 0
  return size + 1
}

export interface PlacementPoint {
  x: number
  y: number
}

/**
 * One drag with a placement tool armed, as a line of placements. The press point is always placed.
 * After that, the pointer's path is walked and a placement goes down every `spacing` units along it,
 * so a slow drag and a fast flick both leave an even line. Placements stop at `cap`.
 *
 * Units are whatever the caller measures in (map pixels here); `spacing` is in the same units.
 */
export class PlacementStroke {
  private readonly spacing: number
  private readonly cap: number
  private last: PlacementPoint | null = null
  private placed = 0

  constructor(spacing: number, cap: number = MAX_PLACEMENTS_PER_DRAG) {
    if (!(spacing > 0)) throw new RangeError('placement spacing must be positive')
    this.spacing = spacing
    this.cap = cap
  }

  /** Placements made so far in this drag. */
  get count(): number {
    return this.placed
  }

  /** Whether the drag has used its placements, so further movement places nothing. */
  get full(): boolean {
    return this.placed >= this.cap
  }

  /** The points to place as the pointer reaches (x, y), in the order the drag reached them. */
  advance(x: number, y: number): PlacementPoint[] {
    if (this.full) return []
    let from = this.last
    if (!from) {
      this.last = { x, y }
      this.placed = 1
      return [{ x, y }]
    }
    const out: PlacementPoint[] = []
    let dx = x - from.x
    let dy = y - from.y
    let dist = Math.hypot(dx, dy)
    while (dist >= this.spacing && !this.full) {
      const next: PlacementPoint = {
        x: from.x + (dx / dist) * this.spacing,
        y: from.y + (dy / dist) * this.spacing,
      }
      out.push(next)
      this.placed += 1
      this.last = next
      from = next
      dx = x - next.x
      dy = y - next.y
      dist = Math.hypot(dx, dy)
    }
    return out
  }
}
