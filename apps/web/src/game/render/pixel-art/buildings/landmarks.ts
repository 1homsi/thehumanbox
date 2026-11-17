import { Art, C, INK, ROOF, WALL, finish, finishGround, isLit, legend, rows } from './kit.ts'
import type { Look } from './kit.ts'
import { plot, spread } from './house-forms.ts'
import { steps } from './shapes.ts'

const W = (look: Look, least: number) => Math.max(least, look.fw * 8 - 2)

/** A pyramid: one face in the sun and one in shade, courses of stone, a gilded capstone. */
export function pyramid(look: Look): Art {
  const w = W(look, 22)
  const { a, g, cx } = plot(look, w)
  const half = w >> 1
  for (let j = 0; j < half; j++) {
    const row = g - half + j
    for (let i = -j; i <= j + 1; i++) {
      const lit = i <= 0
      const course = j % 3 === 2
      a.set(cx + i, row, lit ? (course ? C.tan4 : C.gold5) : course ? C.tan2 : C.tan3)
    }
  }
  a.set(cx, g - half, C.gold4)
    .set(cx + 1, g - half, C.gold3)
    .set(cx, g - half + 1, C.gold5)
    .set(cx + 1, g - half + 1, C.gold3)
  a.rect(cx - 1, g - 3, 2, 3, INK)
  return finish(a)
}

/** A ziggurat: terraces of mud brick, a stair up the front, a blue-glazed shrine on the top. */
export function ziggurat(look: Look): Art {
  const w = W(look, 22)
  const { a, g, x, cx } = plot(look, w)
  const tiers = w >= 30 ? 4 : 3
  const rise = 5
  steps(a, x, g - tiers * rise, w, tiers, rise, 4, [C.tan4, C.tan3, C.tan2, C.tan1])
  // Buttress lines on each terrace, and the stair.
  for (let s = 0; s < tiers; s++) {
    const inset = (tiers - 1 - s) * 4
    for (let i = x + inset + 2; i < x + w - inset - 3; i += 4)
      a.vline(i, g - (tiers - s) * rise + 2, rise - 2, C.tan2)
  }
  for (let j = 0; j < tiers * rise; j++) a.hline(cx - 1, g - 1 - j, 4, j % 2 ? C.tan5 : C.tan3)
  const top = g - tiers * rise
  a.rect(cx - 3, top - 5, 8, 5, C.blue3)
    .hline(cx - 3, top - 5, 8, C.blue4)
    .vline(cx + 4, top - 4, 4, C.blue2)
  a.rect(cx, top - 3, 2, 3, INK).hline(cx - 4, top - 6, 10, C.gold4)
  return finish(a)
}

/** A curved wall seen from the front: `tiers` rows of arches, the ends turning away into light and shade. */
function arcade(
  a: Art,
  x: number,
  g: number,
  w: number,
  tiers: number,
  wallTone: readonly [number, number, number],
  arch: number,
) {
  const h = tiers * 6 + 1
  for (let j = 0; j < h; j++) {
    // The top corners round off, as a drum does seen from a little above.
    const inset = j === 0 ? 3 : j === 1 ? 2 : j < 4 ? 1 : 0
    for (let i = inset; i < w - inset; i++)
      a.set(x + i, g - h + j, i < 3 ? wallTone[0] : i >= w - 4 ? wallTone[2] : wallTone[1])
  }
  for (let t = 0; t < tiers; t++) {
    const ty = g - (t + 1) * 6
    a.hline(x + (t === tiers - 1 ? 1 : 0), ty, w - (t === tiers - 1 ? 2 : 0), wallTone[0])
    for (let i = 3; i + 2 < w - 2; i += 4) a.rect(x + i, ty + 3, 2, 3, arch).hline(x + i, ty + 2, 2, arch)
  }
}

/** A coliseum: three tiers of arches in a great curve, the far rim showing over the near wall, one stretch fallen. */
export function coliseum(look: Look): Art {
  const w = W(look, 22)
  const { a, g, x } = plot(look, w)
  // The far side of the bowl, seen over the near wall: the top rows of seats, then the rim.
  for (let j = 0; j < 5; j++) {
    const inset = j === 0 ? 6 : j === 1 ? 4 : j === 2 ? 3 : 2
    a.hline(x + inset, g - 24 + j, w - inset * 2, j === 0 ? C.tan5 : j % 2 ? C.tan3 : C.tan4)
  }
  arcade(a, x, g, w, 3, [C.tan5, C.tan4, C.tan3], C.tan0)
  // The break: the top tier is gone at the right end, leaving a stair of broken wall.
  for (let k = 0; k < 4; k++) a.rect(x + w - 9 + k * 2, g - 19, 9 - k * 2, 2 + k, 0)
  a.rect(x + (w >> 1) - 2, g - 5, 4, 5, C.tan0)
  return finish(a)
}

/** A triumphal arch: one great opening, an attic above it, a gilded figure on top. */
export function triumphalArch(look: Look): Art {
  const w = W(look, 12)
  const { a, g, x, cx } = plot(look, w)
  a.rect(x, g - 14, w, 14, C.grey8)
    .vline(x, g - 14, 14, C.grey9)
    .rect(x + w - 2, g - 14, 2, 14, C.grey6)
  a.rect(cx - 2, g - 8, 6, 8, 0).rect(cx - 1, g - 9, 4, 1, 0)
  a.hline(x - 1, g - 11, w + 2, C.grey9)
    .hline(x - 1, g - 10, w + 2, C.grey6)
    .hline(x - 1, g - 15, w + 2, C.grey9)
  a.rect(x + 2, g - 13, w - 4, 1, C.gold4)
  a.stamp(rows('figure', '.Y.', 'YYY', '.Y.', 'Y.Y'), cx - 1, g - 19, legend(ROOF.tile, WALL.stone))
  return finish(a)
}

/** An obelisk: a needle of stone with a gilded tip, on a square base. */
export function obelisk(look: Look): Art {
  const { a, g, cx } = plot(look, 8)
  const h = Math.min(18, look.fh * 8 + 10)
  for (let j = 0; j < h; j++) {
    const wide = j > h * 0.5
    a.set(cx, g - 2 - h + j, C.grey8).set(cx + 1, g - 2 - h + j, C.grey6)
    if (wide) a.set(cx - 1, g - 2 - h + j, C.grey9)
  }
  a.set(cx, g - 3 - h, C.gold5).set(cx + 1, g - 3 - h, C.gold4)
  a.rect(cx - 2, g - 2, 5, 2, C.grey7).hline(cx - 2, g - 2, 5, C.grey9)
  // Three carved marks down the shaft.
  for (let j = 4; j < h - 2; j += 4) a.set(cx, g - 2 - h + j, C.grey6)
  return finish(a)
}

/** A monument: a column on steps, a gilded figure standing on it. */
export function monument(look: Look): Art {
  const w = W(look, 12)
  const { a, g, cx } = plot(look, w)
  a.rect(cx - 5, g - 2, 12, 2, C.grey7).hline(cx - 5, g - 2, 12, C.grey9)
  a.rect(cx - 3, g - 5, 8, 3, C.grey8)
    .hline(cx - 3, g - 5, 8, C.grey9)
    .vline(cx + 4, g - 4, 2, C.grey6)
  const h = Math.min(look.fh * 8, 14)
  a.rect(cx - 1, g - 5 - h, 3, h, C.grey8)
    .vline(cx + 1, g - 5 - h, h, C.grey6)
    .hline(cx - 2, g - 5 - h, 5, C.grey9)
  a.stamp(
    rows('figure', '.Y.', 'YYy', '.Y.', '.Yy', 'Y.y'),
    cx - 1,
    g - 10 - h,
    legend(ROOF.tile, WALL.stone),
  )
  return finish(a)
}

/** A statue: a stone figure with one arm raised, on a plinth. */
export function statue(look: Look): Art {
  const { a, g, cx } = plot(look, 8)
  const L = legend(ROOF.tile, WALL.stone)
  a.rect(cx - 2, g - 5, 6, 5, C.grey7)
    .hline(cx - 3, g - 5, 8, C.grey9)
    .rect(cx + 2, g - 4, 2, 4, C.grey6)
    .hline(cx - 3, g - 1, 8, C.grey6)
  a.stamp(
    rows('figure', '..ss.', 's.ss.', 'ssssu', '.sssu', '.ssu.', '.ssu.', '.s.u.', '.s.u.'),
    cx - 1,
    g - 13,
    L,
  )
  return finish(a)
}

// ── Ground: things that lie flat ──────────────────────────────────────────────────────────────────

/** A flat sheet the size of the footprint, filled with one colour; returns it with its top-left corner. */
function ground(look: Look, colour: number): { a: Art; x: number; y: number; w: number; h: number } {
  const w = look.fw * 8
  const h = look.fh * 8
  const a = new Art(w + 4, h + 4)
  a.rect(2, 2, w, h, colour)
  return { a, x: 2, y: 2, w, h }
}

const edged = finishGround

/** A plaza: slabs laid in a grid inside a border of darker stone, a basin of water at the centre. */
export function plaza(look: Look): Art {
  const { a, x, y, w, h } = ground(look, C.tan5)
  for (let j = 2; j < h - 2; j += 4) a.hline(x + 2, y + j, w - 4, C.tan4)
  for (let j = 2; j < h - 2; j += 4)
    for (let i = (j >> 2) % 2 ? 4 : 6; i < w - 2; i += 4) a.vline(x + i, y + j, 4, C.tan4)
  a.rect(x, y, w, 2, C.tan3)
    .rect(x, y + h - 2, w, 2, C.tan3)
    .rect(x, y, 2, h, C.tan3)
    .rect(x + w - 2, y, 2, h, C.tan3)
  a.hline(x, y, w, C.tan4).vline(x, y, h, C.tan4)
  const cx = x + (w >> 1) - 1
  const cy = y + (h >> 1) - 1
  a.stamp(
    rows(
      'basin',
      '..ssss..',
      '.sllLLu.',
      'slihLLju',
      'slhLLjju',
      'slLLjjju',
      'sLLjjjju',
      '.uLjjju.',
      '..uuuu..',
    ),
    cx - 3,
    cy - 3,
    legend(ROOF.tile, WALL.stone),
  )
  return edged(a, C.tan2)
}

/** Still water in a hollow: lighter where the sky lies on it, with reeds and lily pads. */
export function pond(look: Look): Art {
  const { a, x, y, w, h } = ground(look, C.blue3)
  // Round the corners off.
  for (const [cx, cy] of [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ] as const) {
    a.set(x + cx, y + cy, 0)
    a.set(x + (cx ? cx - 1 : 1), y + cy, 0).set(x + cx, y + (cy ? cy - 1 : 1), 0)
  }
  a.hline(x + 3, y + 2, w - 8, C.blue4)
    .hline(x + 5, y + 4, 3, C.blue4)
    .hline(x + 2, y + h - 3, 4, C.blue2)
  a.rect(x + w - 5, y + h - 5, 2, 2, C.green3).set(x + w - 4, y + h - 5, C.plum5)
  a.vline(x + 1, y + 3, 3, C.green2).vline(x + 2, y + 2, 3, C.green3)
  return edged(a, C.tan3)
}

/** A reservoir: a stone-walled basin, wind on the water, a valve house on the dam. */
export function reservoir(look: Look): Art {
  const { a, x, y, w, h } = ground(look, C.grey7)
  a.rect(x + 2, y + 2, w - 4, h - 4, C.blue3)
  a.hline(x, y, w, C.grey9)
    .vline(x, y, h, C.grey8)
    .hline(x + 2, y + 2, w - 4, C.blue2)
    .vline(x + 2, y + 2, h - 4, C.blue2)
  for (let j = 6; j < h - 4; j += 5)
    for (let i = (j / 5) & 1 ? 6 : 10; i < w - 8; i += 9) a.hline(x + i, y + j, 4, C.blue4)
  a.rect(x + w - 7, y + h - 7, 5, 5, C.grey8)
    .rect(x + w - 6, y + h - 5, 2, 3, C.grey4)
    .hline(x + w - 8, y + h - 8, 7, C.red3)
  return edged(a, C.grey5)
}

/** A cemetery: rows of stones in clipped grass, a path, a dark yew. */
export function cemetery(look: Look): Art {
  const { a, x, y, w, h } = ground(look, C.green2)
  const L = legend(ROOF.tile, WALL.stone)
  a.rect(x + (w >> 1) - 1, y, 2, h, C.tan3)
  const stone = rows('stone', '.s.', 'stu', 'stu')
  const cross = rows('cross', '.s.', 'sss', '.s.', '.u.')
  let n = 0
  for (let j = 2; j + 4 <= h; j += 6)
    for (const sx of spread(x, w, Math.floor(w / 6), 3)) {
      if (Math.abs(sx + 1 - (x + (w >> 1))) < 3) continue
      a.stamp(n % 3 === 1 ? cross : stone, sx, y + j, L)
      n++
    }
  a.stamp(rows('yew', '.m.', 'mnm', 'mnm', 'mnm', '.I.'), x + w - 4, y + h - 6, L)
  a.hline(x, y, w, C.grey6).dots(x, y, w, 3, C.grey8)
  return edged(a, C.green1)
}

/** A playground: a swing, a slide and a sandpit on mown grass. */
export function playGround(look: Look): Art {
  const { a, x, y, w, h } = ground(look, C.green3)
  const L = legend(ROOF.tile, WALL.stone)
  a.stamp(
    rows('swing', 'RRRRRRRRR', 'R.o...o.R', 'R.o...o.R', 'R.o...o.R', 'R.ee.ee.R', 'R.......R', 'q.......q'),
    x + 1,
    y + 2,
    L,
  )
  a.stamp(
    rows('slide', 'LLL.....', 'LjLYY...', 'L.L.YY..', 'L.L..YY.', 'L.L...YY', 'j.j....y'),
    x + w - 10,
    y + 2,
    L,
  )
  // The sandpit, with a red bucket.
  a.rect(x + 2, y + h - 9, 9, 7, C.gold2)
    .rect(x + 3, y + h - 8, 7, 5, C.gold5)
    .rect(x + 7, y + h - 6, 2, 2, C.red4)
  a.stamp(rows('seesaw', 'n.......', '.nnnnnnn', '...oo...'), x + w - 10, y + h - 5, L)
  return edged(a, C.green1)
}

/** A fish farm: round net pens in open water, a walkway between them, fish turning in each. */
export function aquaculture(look: Look): Art {
  const { a, x, y, w, h } = ground(look, C.blue3)
  a.hline(x + 2, y + 2, w - 6, C.blue4).hline(x + 4, y + h - 3, w - 9, C.blue2)
  // The walkway down the middle, planked.
  const wx = x + (w >> 1) - 1
  a.rect(wx, y, 3, h, C.tan3).vline(wx, y, h, C.tan4)
  for (let j = 1; j < h; j += 3) a.hline(wx, y + j, 3, C.tan2)
  // A ring of floats for each pen, and two fish inside.
  const ring = rows(
    'ring',
    '..hhhh..',
    '.h....h.',
    'h......h',
    'h......h',
    'h......h',
    'h......h',
    '.h....h.',
    '..hhhh..',
  )
  const L = legend(ROOF.tile, WALL.stone)
  const pens = Math.max(1, Math.floor(h / 11))
  for (let p = 0; p < pens; p++) {
    const py = y + 2 + p * Math.floor((h - 3) / pens)
    for (const px of [x + 1, x + w - 9]) {
      if (px + 8 > wx && px < wx + 3) continue
      a.stamp(ring, px, py, L)
      a.hline(px + 2, py + 3, 2, C.red5).hline(px + 4, py + 5, 2, C.red4)
    }
  }
  return edged(a, C.blue1)
}

/** A car park: bays marked on the tarmac, and two cars. */
export function parkingLot(look: Look): Art {
  const { a, x, y, w, h } = ground(look, C.grey4)
  for (let i = 4; i < w; i += 5) a.vline(x + i, y + 1, 7, C.grey8).vline(x + i, y + h - 8, 7, C.grey8)
  const car = rows('car', '.AAA.', 'AiiAA', 'AAAAA', 'o...o')
  a.stamp(car, x + 5, y + 2, { ...legend(ROOF.tile, WALL.stone), A: C.red4 })
  a.stamp(car, x + w - 10, y + h - 6, { ...legend(ROOF.tile, WALL.stone), A: C.blue3 })
  return edged(a, C.grey2)
}

/** A field of solar panels: long tilted tables of dark glass in rows, a bright edge where the sun catches each. */
export function solarArray(look: Look): Art {
  const w = look.fw * 8
  const h = look.fh * 8
  const a = new Art(w + 4, h + 4)
  for (let j = 1; j + 6 <= h; j += 8) {
    a.hline(2, 2 + j, w, C.blue4)
    a.rect(2, 3 + j, w, 3, C.blue1).hline(2, 4 + j, w, C.blue2)
    for (let i = 3; i < w; i += 4) a.vline(2 + i, 3 + j, 3, C.blue2)
    // The legs of the table, showing under its lower edge.
    for (let i = 2; i < w; i += 8) a.set(2 + i, 6 + j, C.grey5)
  }
  return finish(a)
}

// ── Crossings and harbours ────────────────────────────────────────────────────────────────────────

/** An aqueduct: a run of arches carrying a channel of water. */
export function aqueduct(look: Look): Art {
  const w = look.fw * 8
  const a = new Art(w + 4, 18)
  const g = 16
  a.rect(2, g - 12, w, 12, C.tan4)
  a.hline(2, g - 12, w, C.blue4)
    .hline(2, g - 11, w, C.grey9)
    .hline(2, g - 9, w, C.grey6)
  // The arches: cut out of the wall, one to a tile.
  for (let i = 0; i + 8 <= w; i += 8) {
    a.rect(2 + i + 2, g - 6, 5, 6, 0).rect(2 + i + 3, g - 7, 3, 1, 0)
    a.vline(2 + i + 1, g - 8, 8, C.tan5).vline(2 + i + 7, g - 8, 8, C.tan3)
  }
  return finish(a)
}

/** A bridge deck seen from above: planks laid across, a rail along each long edge. */
export function bridge(look: Look): Art {
  const w = look.fw * 8
  const h = look.fh * 8
  const a = new Art(w + 4, h + 4)
  a.rect(2, 2, w, h, C.tan3)
  for (let i = 3; i < w; i += 4) a.vline(2 + i, 3, h - 2, C.tan2)
  a.hline(2, 2, w, C.gold3)
    .hline(2, 3, w, C.gold1)
    .hline(2, h, w, C.gold3)
    .hline(2, h + 1, w, C.gold1)
  return finish(a)
}

/** A jetty of planks on piles, `len` long, running down from (x, y). */
function jetty(a: Art, x: number, y: number, w: number, len: number) {
  a.rect(x, y, w, len, C.tan3)
  for (let j = 1; j < len; j += 2) a.hline(x, y + j, w, C.tan2)
  a.vline(x, y, len, C.gold2).vline(x + w - 1, y, len, C.gold1)
}

/** A boat seen from above, lying alongside: a pointed hull, its thwarts, and a furled sail. */
const boatAbove = rows('boat', '.ee.', 'eGGe', 'eeee', 'eGGe', 'ehhe', 'eGGe', 'eeee', 'eGGe', '.ee.')
const skiffAbove = rows('skiff', '.ee.', 'eGGe', 'eeee', 'eGGe', '.ee.')

/**
 * A dock, a marina or a port, all seen from above: a quay along the shore, jetties running out from it, and
 * boats moored against the jetties, each with a ripple of water at its stern.
 */
export function harbour(look: Look): Art {
  const w = look.fw * 8
  const h = look.fh * 8
  const a = new Art(w + 6, h + 6)
  const x = 3
  const y = 3
  const L = legend(ROOF.tile, WALL.stone, isLit(look))
  const port = look.kind === 'Port'
  const piers = spread(x, w, Math.max(1, Math.floor(w / 14)), 4)
  // Boats first, so the jetty they are tied to overlaps their mooring.
  piers.forEach((px, i) => {
    const big = look.kind === 'Marina' || i % 2 === 0
    const by = y + 6 + (i % 2) * 3
    if (by + (big ? 9 : 5) <= y + h) {
      a.stamp(big ? boatAbove : skiffAbove, px + 5, by, L)
      a.hline(px + 5, by + (big ? 10 : 6), 3, C.blue4)
    }
    if (look.kind === 'Marina' && px - 5 >= x && by + 8 <= y + h) a.stamp(skiffAbove, px - 5, by + 3, L)
  })
  piers.forEach((px) => jetty(a, px, y + 4, 4, h - 4))
  // The quay along the shore: stone for a port, planks otherwise, with bollards.
  a.rect(x, y, w, 4, port ? C.grey7 : C.tan3)
    .hline(x, y, w, port ? C.grey9 : C.tan4)
    .hline(x, y + 3, w, port ? C.grey5 : C.gold2)
  for (let i = 3; i < w; i += 6) a.rect(x + i, y + 1, 2, 2, C.grey3)
  if (port) {
    // Crates stacked on the quay, and a lamp at the head of the first pier.
    a.stamp(rows('crates', 'gggg.ggg', 'gefg.gfg', 'gggg.ggg'), x + w - 10, y, L)
    a.rect(piers[0] + 1, y + h - 2, 2, 2, isLit(look) ? C.gold5 : C.grey8)
  }
  return finish(a)
}
