/** Bound unreadable overlapping labels while retaining every person's sprite. */
export function crowdLabelIds(
  people: readonly { id: string; x: number; y: number }[],
  zoom: number,
): Set<string> | null {
  if (people.length <= 400) return null
  const cells = new Map<string, string>()
  const scale = Math.max(0.1, zoom) * 8
  for (const person of people) {
    const key = `${Math.floor((person.x * scale) / 80)},${Math.floor((person.y * scale) / 22)}`
    const previous = cells.get(key)
    if (previous === undefined || person.id < previous) cells.set(key, person.id)
  }
  return new Set(cells.values())
}

/**
 * Greedy label placement: each label claims a box, and one that would
 * overlap a box already claimed is skipped. Boxes are bucketed in a coarse
 * grid so a crowd of hundreds stays cheap.
 */
export class LabelPlacer {
  private cells = new Map<string, [number, number, number, number][]>()
  private readonly cell: number
  constructor(cell = 48) {
    this.cell = cell
  }

  private keys(x0: number, y0: number, x1: number, y1: number): string[] {
    const out: string[] = []
    for (let cx = Math.floor(x0 / this.cell); cx <= Math.floor(x1 / this.cell); cx++)
      for (let cy = Math.floor(y0 / this.cell); cy <= Math.floor(y1 / this.cell); cy++)
        out.push(`${cx},${cy}`)
    return out
  }

  /** Claim a box centred on `x` with its bottom at `y`; false if it would overlap. */
  place(x: number, y: number, w: number, h: number, force = false): boolean {
    const box: [number, number, number, number] = [x - w / 2, y - h, x + w / 2, y]
    const keys = this.keys(box[0], box[1], box[2], box[3])
    if (!force) {
      for (const key of keys) {
        for (const b of this.cells.get(key) ?? []) {
          if (box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]) return false
        }
      }
    }
    for (const key of keys) {
      const list = this.cells.get(key)
      if (list) list.push(box)
      else this.cells.set(key, [box])
    }
    return true
  }
}

/** Approximate width of a monospace label, so placement needs no measuring. */
export function labelWidth(text: string, px: number): number {
  return text.length * px * 0.6 + 4
}
