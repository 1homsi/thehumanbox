import { Art, C, DOOR, INK, ROOF, WALL, WINDOW, finish, isLit, legend, rows, slabRoof, wall } from './kit.ts'
import type { Look, Ramp } from './kit.ts'
import { plot, spread } from './house-forms.ts'
import { flag } from './civic.ts'
import { battlements, cone, dome, drum } from './shapes.ts'

const W = (look: Look, least: number) => Math.max(least, look.fw * 8 - 2)
const STONE = WALL.darkStone

/** A stretch of battlemented wall standing on row `g`, with the walk behind its merlons. */
function curtain(a: Art, x: number, g: number, w: number, h: number) {
  wall(a, x, g - h, w, h, STONE, false)
  battlements(a, x, g - h - 2, w, STONE)
  a.hline(x, g - h, w, C.grey7)
}

/** A round tower with battlements (or a cone roof) standing on row `g`. */
function roundTower(a: Art, x: number, g: number, w: number, h: number, roof: Ramp | null) {
  drum(a, x, g - h, w, h, STONE)
  if (roof) {
    a.hline(x - 1, g - h, w + 2, C.grey7)
    cone(a, x + (w >> 1) - 1, g - h - Math.round(w * 0.8), w + 2, Math.round(w * 0.8), roof, 1, false)
  } else {
    a.hline(x - 1, g - h, w + 2, C.grey7).hline(x - 1, g - h + 1, w + 2, C.grey5)
    battlements(a, x - 1, g - h - 2, w + 2, STONE)
  }
  a.set(x + (w >> 1), g - h + 5, C.grey2).set(x + (w >> 1), g - h + 6, C.grey2)
}

/** A castle: a keep behind a curtain wall, round towers at the corners, the gate between them. */
export function castle(look: Look): Art {
  const w = W(look, 30)
  const { a, g, x, cx } = plot(look, w)
  const L = legend(ROOF.slate, STONE, isLit(look))
  const tall = Math.min(40, look.fh * 6 + 2)
  const tw = Math.max(8, Math.round(w * 0.2))
  // The keep, rising behind everything.
  const kw = Math.round(w * 0.42)
  wall(a, cx - (kw >> 1) + 1, g - tall, kw, tall, STONE, false)
  battlements(a, cx - (kw >> 1) + 1, g - tall - 2, kw, STONE)
  a.hline(cx - (kw >> 1) + 1, g - tall, kw, C.grey7)
  for (const wx of spread(cx - (kw >> 1) + 1, kw, 3, 1)) a.stamp(WINDOW.slit, wx, g - tall + 4, L)
  flag(a, cx, g - tall - 2, C.red4, 7)
  // The curtain wall and its gatehouse.
  const wallH = Math.round(tall * 0.42)
  curtain(a, x + 2, g, w - 4, wallH)
  const gw = 12
  wall(a, cx - 5, g - wallH - 5, gw, wallH + 5, STONE, false)
  battlements(a, cx - 5, g - wallH - 7, gw, STONE)
  a.hline(cx - 5, g - wallH - 5, gw, C.grey7)
  // The gate: a dark arch with the portcullis half down.
  a.rect(cx - 2, g - 9, 6, 9, INK).hline(cx - 1, g - 10, 4, INK)
  for (let i = cx - 2; i < cx + 4; i += 2) a.vline(i, g - 9, 5, C.grey5)
  a.hline(cx - 2, g - 6, 6, C.grey5)
  a.stamp(WINDOW.slit, cx - 4, g - wallH - 2, L).stamp(WINDOW.slit, cx + 5, g - wallH - 2, L)
  // The corner towers, capped in slate.
  const th = Math.round(tall * 0.68)
  roundTower(a, x, g, tw, th, ROOF.slate)
  roundTower(a, x + w - tw, g, tw, th, ROOF.slate)
  return finish(a)
}

/** A barracks: a long hall with a weapons rack at the door and the garrison's banner. */
export function barracks(look: Look): Art {
  const w = W(look, 22)
  const { a, g, x, cx } = plot(look, w)
  const L = legend(ROOF.wood, STONE, isLit(look))
  wall(a, x, g - 10, w, 10, STONE)
  for (const wx of spread(x, w, 5, 1)) if (Math.abs(wx - cx) > 3) a.stamp(WINDOW.slit, wx, g - 8, L)
  a.stamp(DOOR.double, cx - 2, g - 7, L)
  slabRoof(a, x - 1, g - 17, w + 2, 7, ROOF.wood, 1)
  // Spears in a rack, and a round shield.
  a.stamp(rows('rack', 'u.u.u', 'e.e.e', 'e.e.e', 'e.e.e', 'eeeee'), x + 1, g - 5, L)
  a.stamp(rows('shield', '.RR.', 'RYYR', 'RYYR', '.RR.'), x + w - 6, g - 6, L)
  flag(a, x + w - 2, g - 17, C.red4, 8)
  return finish(a)
}

/** A wooden watchtower: a roofed platform on braced legs, with its ladder. */
export function watchtower(look: Look): Art {
  const w = W(look, 12)
  const { a, g, x } = plot(look, w)
  const legs = Math.min(18, look.fh * 8)
  // Legs, cross-braced.
  a.vline(x + 1, g - legs, legs, C.gold1).vline(x + w - 2, g - legs, legs, C.gold2)
  for (let j = 0; j < legs - 2; j++) {
    const t = j % (w - 4)
    a.set(x + 2 + t, g - legs + j + 1, C.gold1)
  }
  // The ladder up the front.
  const lx = x + (w >> 1) - 1
  a.vline(lx, g - legs, legs, C.gold3).vline(lx + 2, g - legs, legs, C.gold3)
  for (let j = 1; j < legs; j += 2) a.set(lx + 1, g - j, C.gold3)
  // The platform, its rail, and the roof.
  a.rect(x - 1, g - legs - 2, w + 2, 2, C.gold2).hline(x - 1, g - legs - 2, w + 2, C.gold3)
  a.rect(x, g - legs - 6, w, 4, C.tan2).hline(x, g - legs - 6, w, C.gold1)
  a.rect(x + 2, g - legs - 5, w - 4, 2, INK)
  a.vline(x, g - legs - 10, 4, C.gold1).vline(x + w - 1, g - legs - 10, 4, C.gold1)
  slabRoof(a, x - 2, g - legs - 14, w + 4, 4, ROOF.straw, 2, false)
  return finish(a)
}

/** A stretch of town wall: merlons, a walk, courses of block. Drawn without ink on its two ends, so a row joins up. */
export function townWall(look: Look): Art {
  const w = look.fw * 8
  const a = new Art(w + 2, 13)
  const course = rows(
    'wall',
    'ss.ss.ss',
    'tt.tt.tt',
    'ssssssss',
    'tttuttut',
    'tttttttt',
    'uttttutt',
    'tttttttt',
    'tutttttu',
    'vvvvvvvv',
  )
  const L = legend(ROOF.slate, STONE)
  for (let i = 0; i < w; i += 8) a.stamp(course, 1 + i, 2, L)
  a.outline(INK)
  for (let y = 0; y < a.h; y++) a.set(0, y, 0).set(a.w - 1, y, 0)
  return a.trim()
}

/** A town gate: two capped posts, an arch between them, and the portcullis hanging in it. */
export function gate(look: Look): Art {
  const w = look.fw * 8
  const a = new Art(w + 4, 22)
  const g = 21
  const x = 2
  // The posts, taller than the wall, and the arch that joins them.
  a.rect(x, g - 15, 2, 15, C.grey7)
    .vline(x, g - 15, 15, C.grey8)
    .rect(x + w - 2, g - 15, 2, 15, C.grey6)
    .vline(x + w - 1, g - 15, 15, C.grey5)
  a.hline(x - 1, g - 16, 4, C.grey9).hline(x + w - 3, g - 16, 4, C.grey8)
  a.rect(x + 2, g - 12, w - 4, 3, C.grey7).hline(x + 2, g - 12, w - 4, C.grey9)
  // The opening, and the portcullis: bars with their points.
  a.rect(x + 2, g - 9, w - 4, 9, INK)
  for (let i = x + 2; i < x + w - 2; i += 2) a.vline(i, g - 9, 6, C.grey5)
  a.hline(x + 2, g - 7, w - 4, C.grey5)
  return finish(a)
}

/** A stone tower: round, battlemented, a door at its foot. */
export function tower(look: Look): Art {
  const w = W(look, 10) - 2
  const { a, g, x } = plot(look, w)
  const h = Math.min(24, look.fh * 8 + 6)
  const L = legend(ROOF.slate, STONE, isLit(look))
  roundTower(a, x, g, w, h, null)
  a.stamp(DOOR.low, x + (w >> 1) - 1, g - 4, L)
  a.hline(x, g - Math.round(h * 0.55), w, C.grey5)
  flag(a, x + (w >> 1), g - h - 2, C.blue3, 6)
  return finish(a)
}

/**
 * A lighthouse: a tapering tower in bands of red and white, a gallery, and the lantern. The harbour light is
 * another thing altogether: a short white tower on a stone pier head, showing green.
 */
export function lighthouse(look: Look): Art {
  const { a, g, cx } = plot(look, 12)
  const lit = isLit(look)
  if (look.kind === 'Lighthouse2') {
    // The pier head: rough stone, wider than the tower.
    a.rect(cx - 5, g - 5, 12, 5, C.grey6)
      .hline(cx - 5, g - 5, 12, C.grey8)
      .rect(cx + 5, g - 4, 2, 4, C.grey5)
    a.set(cx - 3, g - 3, C.grey5)
      .set(cx + 1, g - 2, C.grey5)
      .hline(cx - 6, g - 1, 14, C.blue3)
    const h = 12
    for (let j = 0; j < h; j++)
      for (let i = -2; i <= 3; i++)
        a.set(
          cx + i,
          g - 5 - h + j,
          j === 5 || j === 6 ? (i > 1 ? C.green2 : C.green3) : i > 1 ? C.grey7 : C.grey9,
        )
    a.rect(cx, g - 9, 2, 4, C.gold1)
    a.hline(cx - 3, g - 5 - h, 8, C.grey4)
    a.rect(cx - 1, g - 9 - h, 4, 4, lit ? C.green4 : C.green3).vline(
      cx,
      g - 9 - h,
      4,
      lit ? C.grey9 : C.green4,
    )
    a.hline(cx - 2, g - 10 - h, 6, C.green1).hline(cx, g - 11 - h, 2, C.green2)
    return finish(a)
  }
  const h = Math.min(30, look.fh * 8 + 6)
  for (let j = 0; j < h; j++) {
    const half = j < h * 0.33 ? 3 : j < h * 0.66 ? 4 : 5
    const stripe = Math.floor(j / 5) % 2 === 0
    for (let i = -half + 1; i <= half; i++) {
      const shade = i > half - 2
      a.set(cx + i, g - h + j, stripe ? (shade ? C.red3 : C.red4) : shade ? C.grey7 : C.grey9)
    }
  }
  a.rect(cx, g - 4, 2, 4, C.gold1)
  a.set(cx, g - Math.round(h * 0.6), C.grey2).set(cx, g - Math.round(h * 0.6) + 1, C.grey2)
  // The gallery and the lantern room.
  a.hline(cx - 4, g - h, 10, C.grey3).hline(cx - 4, g - h - 1, 10, C.grey5)
  a.rect(cx - 2, g - h - 5, 6, 4, lit ? C.gold5 : C.blue5)
    .vline(cx, g - h - 5, 4, lit ? C.grey9 : C.blue4)
    .vline(cx + 3, g - h - 5, 4, lit ? C.gold4 : C.blue3)
  a.hline(cx - 3, g - h - 6, 8, C.red3)
    .hline(cx - 2, g - h - 7, 6, C.red4)
    .hline(cx, g - h - 8, 2, C.red4)
  a.vline(cx, g - h - 10, 2, C.grey5)
  if (lit) {
    // The beam, sweeping left.
    for (let i = 0; i < 6; i++) a.set(cx - 4 - i, g - h - 3 - (i >> 2), C.gold5)
  }
  return finish(a)
}

/** A clock tower: four faces under a steep roof. */
export function clockTower(look: Look): Art {
  const w = W(look, 10) - 2
  const { a, g, x, cx } = plot(look, w)
  const h = Math.min(26, look.fh * 8 + 8)
  const L = legend(ROOF.slate, WALL.brick, isLit(look))
  wall(a, x, g - h, w, h, WALL.brick, false)
  a.hline(x, g - h + 9, w, C.grey8).hline(x, g - 7, w, C.red2)
  // The clock: a round pale face in a dark ring, its hands at ten to two.
  a.stamp(rows('clock', '.kkkk.', 'kAAAAk', 'kAkAAk', 'kAAkAk', 'kAAAAk', '.kkkk.'), cx - 2, g - h + 2, {
    ...L,
    A: isLit(look) ? C.gold5 : C.grey9,
  })
  a.stamp(WINDOW.slit, cx, g - h + 12, L).stamp(DOOR.arch, cx - 1, g - 6, L)
  a.hline(x - 1, g - h - 1, w + 2, C.grey8)
  cone(a, cx, g - h - 9, w + 2, 8, ROOF.slate, 2, false)
  a.vline(cx, g - h - 12, 3, C.gold4)
  return finish(a)
}

/** An observatory: a stone drum under a white dome, the slit open and the telescope out. */
export function observatory(look: Look): Art {
  const w = W(look, 14)
  const { a, g, x, cx } = plot(look, w)
  const r = Math.min(10, (w >> 1) - 1)
  const L = legend(ROOF.slate, WALL.stone, isLit(look))
  drum(a, cx - r + 1, g - 8, r * 2, 8, WALL.stone)
  a.hline(cx - r, g - 9, r * 2 + 2, C.grey9).hline(cx - r, g - 8, r * 2 + 2, C.grey6)
  dome(a, cx, g - 9 - r, r, [C.grey9, C.grey9, C.grey8, C.grey7])
  // The slit, and the telescope pointing out of it.
  for (let j = 1; j < r; j++) a.rect(cx + 1, g - 9 - r + j, 2, 1, C.blue1)
  a.rect(cx + 2, g - 11 - r, 2, 4, C.grey4)
    .rect(cx + 3, g - 13 - r, 2, 3, C.grey5)
    .set(cx + 4, g - 14 - r, C.blue4)
  a.stamp(DOOR.low, cx - 4, g - 4, L)
  a.set(x, g - 1, C.grey6)
  return finish(a)
}

/** A water tower: a banded tank under a cone, on braced legs, with its pipe. */
export function waterTower(look: Look): Art {
  const w = W(look, 12) - 2
  const { a, g, x, cx } = plot(look, w)
  const legs = Math.min(12, look.fh * 6)
  a.vline(x + 1, g - legs, legs, C.grey4)
    .vline(x + w - 2, g - legs, legs, C.grey4)
    .vline(cx, g - legs, legs, C.grey5)
  for (let j = 0; j < legs; j++) a.set(x + 2 + (j % (w - 4)), g - legs + j, C.grey4)
  drum(a, x, g - legs - 9, w, 9, [C.blue5, C.blue4, C.blue3, C.blue2])
  a.hline(x, g - legs - 6, w, C.grey5).hline(x, g - legs - 2, w, C.grey5)
  cone(a, cx, g - legs - 13, w + 2, 4, ROOF.dark, 2, false)
  a.vline(cx + 2, g - legs, legs, C.blue3)
  return finish(a)
}

/** A radio mast: a lattice in red and white, a light at the top, a hut at its foot. */
export function radioTower(look: Look): Art {
  const { a, g, cx } = plot(look, 12)
  const h = Math.min(34, look.fh * 8 + 14)
  for (let j = 0; j < h; j++) {
    const half = 1 + Math.floor((j * 4) / h)
    const red = Math.floor(j / 5) % 2 === 0
    const c = red ? C.red4 : C.grey9
    a.set(cx - half + 1, g - h + j, c).set(cx + half, g - h + j, red ? C.red3 : C.grey7)
    // The lattice: a diagonal that reverses every band.
    const t = j % 5
    const span = half * 2 - 1
    if (span > 1)
      a.set(cx - half + 1 + Math.round((Math.floor(j / 5) % 2 ? t : 4 - t) * (span / 4)), g - h + j, C.grey5)
    if (t === 0) a.hline(cx - half + 1, g - h + j, half * 2, c)
  }
  a.vline(cx, g - h - 4, 4, C.grey5).set(cx, g - h - 5, isLit(look) ? C.red5 : C.red4)
  a.rect(cx + 2, g - h + 8, 3, 3, C.grey8).set(cx + 4, g - h + 9, C.grey6)
  // The equipment hut.
  a.rect(cx - 6, g - 5, 5, 5, C.grey8)
    .hline(cx - 6, g - 5, 5, C.grey9)
    .rect(cx - 5, g - 3, 2, 3, C.grey4)
  return finish(a)
}

/**
 * A sail: an arm from the hub running out by (dx, dy) per pixel, and a canvas two pixels deep along its
 * trailing side, pale on the arm and a tone darker at its edge. Four of these make a clean cross.
 */
function sail(a: Art, hx: number, hy: number, dx: number, dy: number, len: number) {
  for (let i = 1; i <= len; i++) {
    const px = hx + dx * i
    const py = hy + dy * i
    a.set(px, py, C.gold1)
    if (i > 2)
      a.set(px - dy, py + dx, C.grey9).set(px - dy * 2, py + dx * 2, i === len || i === 3 ? C.gold1 : C.tan4)
  }
}

/** A windmill. The tower mill is stone with a turning cap; the post mill is a wooden house on a trestle. */
export function windmill(look: Look): Art {
  const { a, g, cx } = plot(look, 20)
  const L = legend(ROOF.dark, WALL.plaster, isLit(look))
  const post = look.kind === 'Mill'
  const h = 18
  if (post) {
    // The trestle, then the boarded body of the mill, with its ladder.
    a.vline(cx, g - 6, 6, C.gold1).vline(cx + 1, g - 6, 6, C.gold2)
    for (let i = 0; i < 5; i++) a.set(cx - 1 - i, g - 1 - i, C.gold1).set(cx + 2 + i, g - 1 - i, C.gold2)
    wall(a, cx - 4, g - h, 10, 12, WALL.white, false)
    for (let j = g - h + 3; j < g - 7; j += 3) a.hline(cx - 4, j, 8, C.grey8)
    a.stamp(WINDOW.small, cx - 1, g - h + 6, L)
    slabRoof(a, cx - 5, g - h - 4, 12, 4, ROOF.wood, 2, false)
  } else {
    // A tapering stone tower, white-washed, under a boat-shaped cap.
    for (let j = 0; j < h; j++) {
      const half = j < 6 ? 4 : j < 12 ? 5 : 6
      for (let i = -half + 1; i <= half; i++)
        a.set(cx + i, g - h + j, i > half - 2 ? C.tan4 : i === -half + 1 ? C.grey9 : C.tan5)
    }
    a.stamp(DOOR.low, cx - 1, g - 4, L).stamp(WINDOW.small, cx - 1, g - 12, L)
    a.hline(cx - 4, g - h, 10, C.grey4)
      .hline(cx - 3, g - h - 1, 8, C.grey5)
      .hline(cx - 2, g - h - 2, 6, C.grey5)
      .hline(cx - 1, g - h - 3, 4, C.grey6)
  }
  // Four sails from the hub.
  const hx = cx + 1
  const hy = g - h + 1
  // The tower mill's sails stand as a saltire; the post mill's, mid-turn, as an upright cross.
  const arms: [number, number][] = post
    ? [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]
    : [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]
  for (const [dx, dy] of arms) sail(a, hx, hy, dx, dy, post ? 8 : 9)
  a.rect(hx - 1, hy - 1, 2, 2, C.gold1)
  return finish(a)
}

/** A watermill: a stone mill house with its wheel turning in the race beside it. */
export function watermill(look: Look): Art {
  const w = W(look, 14) - 6
  const { a, g, x } = plot(look, w + 6)
  const L = legend(ROOF.tile, WALL.stone, isLit(look))
  wall(a, x, g - 11, w, 11, WALL.stone)
  a.stamp(DOOR.low, x + 2, g - 4, L).stamp(WINDOW.framed, x + w - 7, g - 9, L)
  slabRoof(a, x - 1, g - 18, w + 2, 7, ROOF.tile, 2)
  // The race, and the wheel: rim, spokes and paddles.
  const wx = x + w + 4
  const wy = g - 6
  a.rect(x + w - 1, g - 2, 10, 2, C.blue3).hline(x + w - 1, g - 2, 10, C.blue4)
  const rim = rows(
    'wheel',
    '..eeeee..',
    '.ee.e.ee.',
    'ee..e..ee',
    'e.e.e.e.e',
    'eeeeoeeee',
    'e.e.e.e.e',
    'ee..e..ee',
    '.ee.e.ee.',
    '..eeeee..',
  )
  a.stamp(rim, wx - 4, wy - 4, L)
  a.set(wx - 5, wy, C.gold1)
    .set(wx + 5, wy, C.gold1)
    .set(wx, wy - 5, C.gold1)
  a.hline(x + w, wy, 2, C.gold1)
  return finish(a)
}
