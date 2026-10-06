/** Screen-space size of one label cell (in map pixels at zoom 1) used to thin a dense crowd. */
const LABEL_CELL_W = 80
const LABEL_CELL_H = 22
/** Crowds up to this size show every name. */
const CROWD_LABEL_LIMIT = 400

/** One number for a pair of small integers (grid cells are far below 2^21). */
const gridKey = (cx: number, cy: number): number => (cx + 0x100000) * 0x400000 + (cy + 0x100000)

/**
 * Bound unreadable overlapping labels while retaining every person's sprite: in a crowd of more
 * than 400, one label per screen cell, the person with the smallest id (so the choice does not
 * depend on draw order). `null` means every label may show.
 */
export function crowdLabelIds(
  people: readonly { id: string; x: number; y: number }[],
  zoom: number,
): Set<string> | null {
  if (people.length <= CROWD_LABEL_LIMIT) return null
  const cells = new Map<number, string>()
  const scale = Math.max(0.1, zoom) * 8
  for (const person of people) {
    const key = gridKey(
      Math.floor((person.x * scale) / LABEL_CELL_W),
      Math.floor((person.y * scale) / LABEL_CELL_H),
    )
    const previous = cells.get(key)
    if (previous === undefined || person.id < previous) cells.set(key, person.id)
  }
  return new Set(cells.values())
}

/** `crowdLabelIds` for the people at `slots[0..count)` of `people`, without building a list of them. */
export function crowdLabelIdsAt(
  people: readonly { id: string; x: number; y: number }[],
  slots: ArrayLike<number>,
  count: number,
  zoom: number,
): Set<string> | null {
  if (count <= CROWD_LABEL_LIMIT) return null
  const cells = new Map<number, string>()
  const scale = Math.max(0.1, zoom) * 8
  for (let k = 0; k < count; k++) {
    const person = people[slots[k]]
    const key = gridKey(
      Math.floor((person.x * scale) / LABEL_CELL_W),
      Math.floor((person.y * scale) / LABEL_CELL_H),
    )
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
  /** Per bucket, the boxes claimed in it as flat [x0, y0, x1, y1, ...]. */
  private cells = new Map<number, number[]>()
  private readonly cell: number
  constructor(cell = 48) {
    this.cell = cell
  }

  /** Claim a box centred on `x` with its bottom at `y`; false if it would overlap. */
  place(x: number, y: number, w: number, h: number, force = false): boolean {
    const x0 = x - w / 2
    const y0 = y - h
    const x1 = x + w / 2
    const y1 = y
    const cell = this.cell
    const cx0 = Math.floor(x0 / cell)
    const cx1 = Math.floor(x1 / cell)
    const cy0 = Math.floor(y0 / cell)
    const cy1 = Math.floor(y1 / cell)
    if (!force) {
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cy = cy0; cy <= cy1; cy++) {
          const list = this.cells.get(gridKey(cx, cy))
          if (!list) continue
          for (let i = 0; i < list.length; i += 4) {
            if (x0 < list[i + 2] && x1 > list[i] && y0 < list[i + 3] && y1 > list[i + 1]) return false
          }
        }
      }
    }
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const key = gridKey(cx, cy)
        const list = this.cells.get(key)
        if (list) list.push(x0, y0, x1, y1)
        else this.cells.set(key, [x0, y0, x1, y1])
      }
    }
    return true
  }
}

/** Approximate width of a monospace label, so placement needs no measuring. */
export function labelWidth(text: string, px: number): number {
  return text.length * px * 0.6 + 4
}
