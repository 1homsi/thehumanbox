import { Art } from '../art.ts'
import { C, INK } from '../palette.ts'

/** Colours snow never settles on: the ink line, glass, lamps and flags are left showing. */
const BARE = new Set<number>([INK, C.blue4, C.blue2, C.gold5, C.gold4])

/**
 * Snow on a building: in every column the top one or two pixels under the outline turn white, with a
 * blue-grey pixel under the deeper drifts. Which columns drift deeper follows a fixed three-column rhythm,
 * so the cap reads as drawn snow, not as noise. Returns a new sprite.
 */
export function snowOn(art: Art): Art {
  const out = new Art(art.w, art.h)
  out.px.set(art.px)
  for (let x = 0; x < art.w; x++) {
    let y = 0
    while (y < art.h && (art.get(x, y) === 0 || art.get(x, y) === INK)) y++
    // Only the top of the silhouette: a column that starts halfway down (a wall beside a roof) still counts.
    if (y >= art.h || BARE.has(art.get(x, y))) continue
    const deep = x % 3 !== 1
    out.set(x, y, C.grey9)
    if (deep && art.get(x, y + 1) && !BARE.has(art.get(x, y + 1))) out.set(x, y + 1, C.grey9)
    if (deep && x % 3 === 0 && art.get(x, y + 2) && !BARE.has(art.get(x, y + 2))) out.set(x, y + 2, C.grey8)
  }
  return out
}

/** A crack: a short broken line of ink, stepping down and to one side. */
const CRACK: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 1],
  [1, 2],
  [1, 3],
  [0, 4],
  [-1, 5],
]

/**
 * A building in poor repair: cracks run down its walls and tiles are missing from its roof. `variant` moves
 * the marks so two worn buildings side by side do not match. Marks only land on the building's own pixels and
 * never on its outline, so the silhouette stays whole. Returns a new sprite.
 */
export function wornOn(art: Art, variant: number): Art {
  const out = new Art(art.w, art.h)
  out.px.set(art.px)
  const inside = (x: number, y: number) => {
    const c = art.get(x, y)
    return c !== 0 && c !== INK
  }
  const marks = Math.max(1, Math.round(art.w / 12))
  for (let m = 0; m < marks; m++) {
    const cx = Math.round(((m + 0.5 + ((variant + m) % 3) * 0.2) * art.w) / (marks + 0.4))
    const top = Math.round(art.h * (0.45 + ((variant + m * 2) % 3) * 0.08))
    for (const [dx, dy] of CRACK) if (inside(cx + dx, top + dy)) out.set(cx + dx, top + dy, INK)
    // A gap in the roof above it: two dark pixels where tiles have slipped.
    const ry = Math.round(art.h * (0.14 + ((variant + m) % 2) * 0.08))
    const rx = cx + (m % 2 ? 3 : -2)
    if (inside(rx, ry) && inside(rx + 1, ry)) out.set(rx, ry, C.gold1).set(rx + 1, ry, INK)
  }
  return out
}
