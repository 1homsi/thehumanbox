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

const CELL_SMI_HALF = 16384
/** A cell key that is a small integer (a V8 Smi) for cells within +-CELL_SMI_HALF. */
const smiCellKey = (cx: number, cy: number): number => (cx + CELL_SMI_HALF) * 32768 + (cy + CELL_SMI_HALF)

/** The cell -> slot winners of the last `crowdLabelWinners` call (reused, so a frame allocates nothing). */
const winnerCells = new Map<number, number>()

/**
 * `crowdLabelIds` for the people at `slots[0..count)`, as flags on their slots: `out[j] = 1` for the one person
 * per screen cell who gets a label, 0 for everyone else among `slots`. Returns false, and writes nothing, when the
 * crowd is small enough that every label may show. Same choice as `crowdLabelIds`: the smallest id in each cell.
 */
export function crowdLabelWinners(
  people: readonly { id: string; x: number; y: number }[],
  slots: ArrayLike<number>,
  count: number,
  zoom: number,
  out: Uint8Array,
  xs?: ArrayLike<number>,
  ys?: ArrayLike<number>,
  ids?: ArrayLike<string>,
): boolean {
  if (count <= CROWD_LABEL_LIMIT) return false
  const scale = Math.max(0.1, zoom) * 8
  // Cell keys that are small integers keep the Map on its fast path; a crowd far outside that range
  // (cells beyond +-16384) uses the float key for the whole call. Both keys identify a cell uniquely.
  let smi = true
  for (let pass = 0; pass < 2; pass++) {
    const key = pass === 0 ? smiCellKey : gridKey
    const cells = winnerCells
    cells.clear()
    let wide = false
    for (let k = 0; k < count && !wide; k++) {
      const j = slots[k]
      const x = xs ? xs[j] : people[j].x
      const y = ys ? ys[j] : people[j].y
      const cx = Math.floor((x * scale) / LABEL_CELL_W)
      const cy = Math.floor((y * scale) / LABEL_CELL_H)
      if (smi && (cx < -CELL_SMI_HALF || cx >= CELL_SMI_HALF || cy < -CELL_SMI_HALF || cy >= CELL_SMI_HALF)) {
        wide = true
        break
      }
      const cellKey = key(cx, cy)
      const previous = cells.get(cellKey)
      if (
        previous === undefined ||
        (ids ? ids[j] : people[j].id) < (ids ? ids[previous] : people[previous].id)
      ) {
        cells.set(cellKey, j)
      }
    }
    if (wide) {
      smi = false
      continue
    }
    for (let k = 0; k < count; k++) out[slots[k]] = 0
    for (const winner of cells.values()) out[winner] = 1
    return true
  }
  return true
}

/**
 * Greedy label placement: each label claims a box, and one that would
 * overlap a box already claimed is skipped. Boxes are bucketed in a coarse
 * grid so a crowd of hundreds stays cheap.
 */
export class LabelPlacer {
  /**
   * Per bucket, the boxes claimed in it as flat [x0, y0, x1, y1, ...]. Buckets within the Smi cell range are
   * keyed by a small integer; any other bucket is keyed by the float key in `wide`. A bucket is in exactly one
   * of the two maps, decided by its coordinates alone, so the split changes no lookup.
   */
  private cells = new Map<number, number[]>()
  private wide = new Map<number, number[]>()
  private readonly cell: number
  constructor(cell = 48) {
    this.cell = cell
  }

  /** The boxes claimed in bucket (cx, cy), created when `create` is set; undefined when there are none. */
  private bucket(cx: number, cy: number, create: boolean): number[] | undefined {
    const inSmi = cx >= -CELL_SMI_HALF && cx < CELL_SMI_HALF && cy >= -CELL_SMI_HALF && cy < CELL_SMI_HALF
    const map = inSmi ? this.cells : this.wide
    const key = inSmi ? smiCellKey(cx, cy) : gridKey(cx, cy)
    let list = map.get(key)
    if (list === undefined && create) {
      list = []
      map.set(key, list)
    }
    return list
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
          const list = this.bucket(cx, cy, false)
          if (!list) continue
          for (let i = 0; i < list.length; i += 4) {
            if (x0 < list[i + 2] && x1 > list[i] && y0 < list[i + 3] && y1 > list[i + 1]) return false
          }
        }
      }
    }
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        this.bucket(cx, cy, true)!.push(x0, y0, x1, y1)
      }
    }
    return true
  }
}

/** Approximate width of a monospace label, so placement needs no measuring. */
export function labelWidth(text: string, px: number): number {
  return text.length * px * 0.6 + 4
}
