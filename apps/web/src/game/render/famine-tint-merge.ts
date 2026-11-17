export const TINT_SIZE = 110
export const TINT_MERGE_DISTANCE = TINT_SIZE * 0.6
const MAX_TINT_GROWTH = 1.8

export interface TintSpot {
  x: number
  y: number
  severity: number
}

export interface TintGroup {
  lead: number
  x: number
  y: number
  count: number
}

export function mergeTintSpots(spots: readonly TintSpot[], distance: number): TintGroup[] {
  const order = spots.map((_, i) => i).sort((a, b) => spots[b].severity - spots[a].severity || a - b)
  const taken = new Uint8Array(spots.length)
  const groups: TintGroup[] = []
  const reach = distance * distance
  for (const lead of order) {
    if (taken[lead]) continue
    taken[lead] = 1
    let sx = spots[lead].x
    let sy = spots[lead].y
    let count = 1
    for (const other of order) {
      if (taken[other]) continue
      const dx = spots[other].x - spots[lead].x
      const dy = spots[other].y - spots[lead].y
      if (dx * dx + dy * dy > reach) continue
      taken[other] = 1
      sx += spots[other].x
      sy += spots[other].y
      count += 1
    }
    groups.push({ lead, x: sx / count, y: sy / count, count })
  }
  return groups
}

export function tintGrowth(count: number): number {
  return Math.min(MAX_TINT_GROWTH, 1 + Math.log2(count) * 0.25)
}
