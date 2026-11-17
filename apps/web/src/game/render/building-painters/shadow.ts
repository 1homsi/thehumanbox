import { PAD_BOT } from './kit'

/**
 * Where the flat shadow of a building falls: rows of [x from, x to), top to bottom, on the ground to the
 * right of and below its base. It starts under the building's bottom edge (`groundY`) and leans down and
 * to the right, as far as the cell's padding allows, longer for taller buildings.
 */
export function shadowRows(
  bx0: number,
  bx1: number,
  groundY: number,
  height: number,
  room: number,
): { y: number; x0: number; x1: number }[] {
  const reach = Math.min(room, 6, Math.max(2, Math.round(height * 0.22)))
  const depth = Math.min(PAD_BOT, Math.max(1, Math.round(reach / 2)))
  const lift = Math.min(5, Math.max(2, Math.round(height * 0.1)))
  const rows = []
  for (let i = 0; i < lift + depth; i++) {
    const t = i / (lift + depth - 1)
    const x1 = bx1 + 1 + Math.round(reach * t)
    const x0 = i < lift ? bx0 + 1 : bx0 + 1 + Math.round((reach * (i - lift + 1)) / depth)
    rows.push({ y: groundY - lift + i, x0, x1 })
  }
  return rows
}
