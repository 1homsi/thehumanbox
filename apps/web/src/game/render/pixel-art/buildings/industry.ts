import {
  Art,
  C,
  DOOR,
  INK,
  ROOF,
  WALL,
  WINDOW,
  finish,
  flatRoof,
  gable,
  isLit,
  legend,
  rows,
  slabRoof,
  wall,
} from './kit.ts'
import type { Look, Ramp } from './kit.ts'
import { plot, spread } from './house-forms.ts'
import { signboard } from './trades.ts'
import { dome, drum } from './shapes.ts'

const W = (look: Look, least: number) => Math.max(least, look.fw * 8 - 2)
const STEEL: Ramp = [C.grey8, C.grey7, C.grey6, C.grey5]
const fire = (look: Look) => (isLit(look) ? C.gold5 : C.gold4)

/** A factory chimney standing on row `g`: brick, banded near the top, with a dark rim. */
export function stack(a: Art, x: number, g: number, h: number, w = 4, ramp: Ramp = WALL.darkBrick) {
  a.rect(x, g - h, w, h, ramp[0])
    .vline(x, g - h, h, C.red4)
    .vline(x + w - 1, g - h, h, ramp[2])
  a.hline(x, g - h + 3, w, C.grey8).hline(x - 1, g - h, w + 2, C.grey3)
}

/** A roller door: grey slats, a lighter one every other row. */
function roller(a: Art, x: number, g: number, w: number, h: number) {
  for (let j = 0; j < h; j++) a.hline(x, g - h + j, w, j === 0 ? C.grey4 : j % 2 ? C.grey7 : C.grey6)
}

const crate = rows('crate', 'gggg', 'gefg', 'gfeg', 'gggg')
const barrel = rows('barrel', '.ee.', 'eggf', 'oooo', 'eggf')
const anvil = rows('anvil', 'ooooo', '.ooo.', '..o..', '.ooo.')

/** A factory: a brick shed under a saw-tooth roof of north lights, and two tall chimneys. */
export function factory(look: Look): Art {
  const w = W(look, 22)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.dark, WALL.brick, isLit(look))
  wall(a, x, g - 12, w, 12, WALL.brick, false)
  a.hline(x, g - 1, w, C.grey5)
  // The saw-tooth: each tooth a glazed upright and a slated slope.
  const teeth = Math.max(2, Math.floor((w - 10) / 9))
  for (let t = 0; t < teeth; t++) {
    const tx = x + t * 9
    for (let j = 0; j < 5; j++) {
      a.hline(tx + 1, g - 17 + j, 2 + j * 1 + (j > 2 ? 1 : 0) + 3, j === 0 ? C.grey5 : C.grey4)
      a.vline(tx, g - 17, 5, L.w).set(tx, g - 13, L.x)
    }
    a.hline(tx, g - 12, 9, C.grey3)
  }
  for (const wx of spread(x + 8, w - 10, Math.max(2, Math.floor((w - 16) / 8)), 6))
    a.stamp(rows('pane', 'eeeeee', 'ewxwxe', 'exxxxe'), wx, g - 9, L)
  roller(a, x + 1, g - 1, 7, 7)
  // The chimneys, the taller in front.
  stack(a, x + w - 5, g, Math.min(look.fh * 8 + 14, 30))
  stack(a, x + w - 10, g, Math.min(look.fh * 8 + 8, 24))
  return finish(a)
}

/** A forge: a stone house with a hearth open to the street, a broad chimney, and the anvil outside. */
export function forge(look: Look): Art {
  const w = W(look, 14)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.dark, WALL.darkStone, isLit(look))
  wall(a, x, g - 11, w, 11, WALL.darkStone)
  slabRoof(a, x - 1, g - 17, w + 2, 6, ROOF.dark, 1)
  // The chimney: wide, with fire-glow at its mouth.
  a.rect(x + w - 8, g - 24, 6, 9, C.grey6)
    .vline(x + w - 8, g - 24, 9, C.grey7)
    .vline(x + w - 3, g - 24, 9, C.grey5)
  a.hline(x + w - 9, g - 25, 8, C.grey4).hline(x + w - 7, g - 26, 4, fire(look))
  // The hearth: an arch with the fire inside.
  a.rect(x + 2, g - 7, 8, 7, INK).hline(x + 3, g - 8, 6, INK)
  a.stamp(rows('fire', '..R..', '.RyR.', 'RyyyR', 'RyhyR'), x + 3, g - 5, L)
  a.stamp(anvil, x + w - 7, g - 4, L)
  signboard(a, 'Smithy', x + 2, g - 20, L)
  return finish(a)
}

/** A smithy: an open shed, the hearth glowing at the back, the anvil at the front. */
export function smithy(look: Look): Art {
  const w = W(look, 12)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.wood, WALL.wood, isLit(look))
  a.rect(x, g - 8, w, 8, INK)
  a.vline(x, g - 8, 8, C.gold2).vline(x + w - 1, g - 8, 8, C.gold1)
  a.stamp(rows('fire', '.R.', 'RyR', 'yhy'), x + 2, g - 4, L)
  a.stamp(anvil, x + w - 7, g - 4, { ...L, o: C.grey6 })
  slabRoof(a, x - 1, g - 13, w + 2, 5, ROOF.wood, 1)
  a.rect(x + 2, g - 19, 3, 6, C.grey6)
    .vline(x + 4, g - 19, 6, C.grey5)
    .hline(x + 1, g - 20, 5, C.grey4)
  signboard(a, 'Smithy', x + w - 8, g - 16, L)
  return finish(a)
}

/** A sawmill: a roof on posts over the great saw, with a pile of logs waiting. */
export function sawMill(look: Look): Art {
  const w = W(look, 14)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.wood, WALL.wood, isLit(look))
  const sw = w - 8
  a.rect(x, g - 9, sw, 8, C.gold0)
  for (const px of [x, x + (sw >> 1), x + sw - 1]) a.vline(px, g - 9, 9, C.gold2)
  slabRoof(a, x - 1, g - 14, sw + 2, 5, ROOF.wood, 1)
  // The bench, a log on it, and the saw blade standing through.
  a.hline(x + 1, g - 3, sw - 2, C.gold3)
    .hline(x + 1, g - 4, sw - 5, C.tan2)
    .set(x + sw - 5, g - 4, C.tan4)
  a.stamp(rows('blade', '.sts.', 'stuts', 'tuouz', 'stuts', '.sts.'), x + 3, g - 9, L)
  // The log pile: three logs, their cut ends showing.
  const logs = rows('logs', '..gg....', '.gTTg...', 'ggTTggg.', 'gTTggTTg', 'gTTggTTg', '.gg..gg.')
  a.stamp(logs, x + sw, g - 6, L)
  return finish(a)
}

/** A tannery: a shed, round vats of dye and bark-water in the yard, a hide stretched on a frame to dry. */
export function tannery(look: Look): Art {
  const w = W(look, 14)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.wood, WALL.wood, isLit(look))
  const sw = Math.round(w * 0.42)
  wall(a, x, g - 8, sw, 8, WALL.wood)
  a.stamp(DOOR.low, x + 2, g - 4, L)
  slabRoof(a, x - 1, g - 13, sw + 2, 5, ROOF.wood, 1)
  // The drying frame, behind the vats.
  const fx = x + sw + 2
  a.stamp(
    rows('hide', 'e......e', 'eAAAAAAe', 'eAAAAAAe', 'e.AAAA.e', 'e..AA..e', 'e......e', 'e......e'),
    fx,
    g - 10,
    { ...L, A: C.tan4 },
  )
  // Three vats, each a different liquor.
  const vat = rows('vat', '.eeee.', 'eAAAAf', 'eggggf', '.ffff.')
  a.stamp(vat, fx - 1, g - 4, { ...L, A: C.red3 })
  if (w - sw > 12) a.stamp(vat, fx + 6, g - 4, { ...L, A: C.gold2 })
  if (w - sw > 18) a.stamp(vat, fx + 13, g - 4, { ...L, A: C.blue2 })
  return finish(a)
}

/** A tank: a banded steel cylinder with a domed or flat top, standing on row `g`. */
function tank(a: Art, x: number, g: number, w: number, h: number, ramp: Ramp = STEEL) {
  drum(a, x, g - h, w, h, ramp)
  a.hline(x + 1, g - h - 1, w - 2, ramp[0])
  for (let j = g - h + 3; j < g - 1; j += 4) a.hline(x, j, w, ramp[2])
}

/** A refinery: tanks, a tall column with its platforms, pipes between them, and the flare. */
export function refinery(look: Look): Art {
  const w = W(look, 22)
  const { a, g, x } = plot(look, w)
  tank(a, x, g, 10, 12, [C.grey9, C.grey8, C.grey7, C.grey6])
  tank(a, x + 11, g, 8, 9)
  // The column.
  const cx = x + w - 9
  const ch = Math.min(30, look.fh * 8)
  drum(a, cx, g - ch, 5, ch, STEEL)
  for (let j = g - ch + 4; j < g - 2; j += 6) a.hline(cx - 1, j, 7, C.grey4)
  a.hline(cx + 1, g - ch - 1, 3, C.grey8)
  // The flare stack and its flame.
  const fx = x + w - 2
  a.vline(fx, g - ch - 2, ch + 2, C.grey5)
  a.stamp(
    rows('flame', '.R.', 'RyR', 'RyR', '.y.'),
    fx - 1,
    g - ch - 6,
    legend(ROOF.dark, STEEL, isLit(look)),
  )
  // Pipes: one run along the ground, one overhead.
  a.hline(x + 9, g - 3, w - 12, C.gold3).hline(x + 9, g - 2, w - 12, C.gold2)
  a.hline(x + 15, g - 11, cx - x - 15, C.grey6)
  return finish(a)
}

/** A cooling tower standing on row `g`: wide at the foot, narrow at the waist, with steam above. */
function coolingTower(a: Art, cx: number, g: number, h: number, lit: boolean) {
  for (let j = 0; j < h; j++) {
    const t = j / (h - 1)
    const half = Math.round(4 + 3 * (2 * t - 0.7) ** 2)
    for (let i = -half + 1; i <= half; i++)
      a.set(cx + i, g - h + j, i > half - 2 ? C.grey6 : i < -half + 3 ? C.grey9 : C.grey8)
  }
  a.hline(cx - 4, g - h, 10, C.grey5)
  // Steam: three flat puffs, each a little further downwind.
  a.rect(cx - 2, g - h - 3, 5, 2, C.grey9)
    .rect(cx, g - h - 6, 5, 2, C.grey9)
    .rect(cx + 3, g - h - 8, 3, 1, lit ? C.grey8 : C.grey9)
}

/** A power station: two cooling towers steaming, the turbine hall, and a striped chimney. */
export function powerPlant(look: Look): Art {
  const w = W(look, 22)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.dark, WALL.concrete, isLit(look))
  const th = Math.min(22, look.fh * 6)
  coolingTower(a, x + 5, g, th, isLit(look))
  coolingTower(a, x + 15, g, th - 3, isLit(look))
  // The turbine hall in front, with its strip of glass.
  const hx = x + Math.round(w * 0.5)
  wall(a, hx, g - 10, w - (hx - x), 10, WALL.concrete, false)
  a.rect(hx + 1, g - 8, w - (hx - x) - 2, 2, L.x).hline(hx + 1, g - 8, w - (hx - x) - 2, L.w)
  roller(a, hx + 2, g - 1, 5, 4)
  flatRoof(a, hx - 1, g - 12, w - (hx - x) + 2, 2, ROOF.dark)
  // The chimney, banded red and white.
  const sx = x + w - 4
  const sh = Math.min(look.fh * 8 + 12, 34)
  for (let j = 0; j < sh; j++) {
    const red = Math.floor(j / 4) % 2 === 0 && j < 16
    a.hline(sx, g - sh + j, 3, red ? C.red4 : C.grey8).set(sx + 2, g - sh + j, red ? C.red3 : C.grey6)
  }
  a.hline(sx - 1, g - sh, 5, C.grey3)
  return finish(a)
}

/** A warehouse: a ribbed iron shed with a wide door, and crates stacked outside. */
export function warehouse(look: Look): Art {
  const w = W(look, 22)
  const { a, g, x, cx } = plot(look, w)
  const L = legend(ROOF.straw, STEEL, isLit(look))
  const iron: Ramp = [C.blue5, C.blue4, C.blue3, C.blue2]
  wall(a, x, g - 10, w, 10, iron, false)
  for (let i = x + 2; i < x + w - 1; i += 3) a.vline(i, g - 10, 10, iron[2])
  gable(a, cx, g - 10 - Math.ceil(((w >> 1) + 1) / 2) - 1, (w >> 1) + 1, ROOF.straw, iron, 2, true, 1)
  roller(a, cx - 4, g, 10, 8)
  a.stamp(crate, x + 1, g - 4, L)
    .stamp(crate, x + 5, g - 4, L)
    .stamp(crate, x + 3, g - 8, L)
  a.stamp(barrel, x + w - 5, g - 4, L)
  return finish(a)
}

/** A hangar: one great arched roof, its doors open on the dark, a windsock beside it. */
export function hangar(look: Look): Art {
  const w = W(look, 22)
  const { a, g, x, cx } = plot(look, w)
  const r = [10, 12, 14, 16, 20].filter((v) => v * 2 <= w + 2).pop() ?? 10
  dome(a, cx, g - r, r, STEEL)
  // The ribs of the roof, and the open doorway.
  for (let i = -r + 3; i < r; i += 4)
    for (let j = 0; j < r; j++) if (a.get(cx + i, g - r + j) === STEEL[1]) a.set(cx + i, g - r + j, STEEL[2])
  const dw = Math.round(r * 1.2)
  for (let j = 0; j < Math.round(r * 0.62); j++) {
    const inset = j < 2 ? 2 - j : 0
    a.hline(cx - (dw >> 1) + 1 + inset, g - Math.round(r * 0.62) + j, dw - inset * 2, C.grey2)
  }
  // A plane's nose and propeller inside.
  a.rect(cx - 1, g - 5, 4, 3, C.grey8)
    .hline(cx - 3, g - 4, 8, C.grey6)
    .vline(cx, g - 7, 6, C.grey5)
  // The windsock.
  a.vline(x + w + 1, g - 10, 10, C.grey5)
  a.stamp(rows('sock', 'RRhR', 'RRhR'), x + w + 2, g - 10, legend(ROOF.dark, STEEL))
  return finish(a)
}

/** A mine: a timbered adit into a mound of rock, rails running out, and an ore cart. */
export function mine(look: Look): Art {
  const w = W(look, 12)
  const { a, g, cx } = plot(look, w)
  const r = w >= 20 ? 10 : 7
  dome(a, cx, g - r, r, [C.grey7, C.grey6, C.grey5, C.grey4])
  // Two ledges of rock, and a seam of ore.
  a.hline(cx - r + 3, g - 3, 4, C.grey7).hline(cx + 2, g - r + 3, 3, C.grey7)
  a.set(cx + r - 4, g - 4, C.gold5).set(cx + r - 5, g - 3, C.gold4)
  // The adit: props and a lintel round the dark.
  a.rect(cx - 2, g - 6, 6, 6, INK)
  a.vline(cx - 3, g - 7, 7, C.gold2)
    .vline(cx + 4, g - 7, 7, C.gold1)
    .hline(cx - 3, g - 7, 8, C.gold3)
  // Rails and the cart.
  a.hline(cx - 1, g - 1, 4, C.grey7)
  a.stamp(rows('cart', 'YyYy', 'uuuv', 'o..o'), cx - 1, g - 4, legend(ROOF.dark, STEEL))
  return finish(a)
}

/** A quarry: the rock cut back in benches, squared blocks waiting, and a wooden crane. */
export function quarry(look: Look): Art {
  const w = W(look, 14)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.dark, WALL.stone, isLit(look))
  // Three benches of rock, each set back from the one below.
  for (let s = 0; s < 3; s++) {
    const bw = w - s * 5
    const by = g - (s + 1) * 4
    a.rect(x, by, bw, 4, s === 0 ? C.grey7 : s === 1 ? C.grey6 : C.grey5)
    a.hline(x, by, bw, C.grey8).vline(x + bw - 1, by, 4, C.grey4)
    for (let i = x + 3 + s; i < x + bw - 2; i += 5) a.vline(i, by + 1, 3, C.grey5)
  }
  // Cut blocks on the floor.
  a.stamp(rows('blocks', '.sst.', 'ssttu', 'ssttu'), x + w - 6, g - 3, L)
  // The crane: a post, a jib, a rope and a block on it.
  const px = x + w - 9
  a.vline(px, g - 16, 12, C.gold2)
  for (let i = 0; i < 6; i++) a.set(px + i, g - 16 - (i >> 1), C.gold2)
  a.vline(px + 5, g - 18, 9, C.tan3).rect(px + 4, g - 9, 3, 2, C.grey8)
  return finish(a)
}

/** A garage or car workshop: roller doors, a tyre stack, and its sign. */
export function garage(look: Look): Art {
  const w = W(look, 12)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.dark, WALL.concrete, isLit(look))
  const auto = look.kind === 'AutoShop'
  wall(a, x, g - 10, w, 10, WALL.concrete, false)
  a.rect(x, g - 10, w, 2, auto ? C.red4 : C.blue3)
  for (const dx of spread(x, w, w >= 20 ? 2 : 1, 8)) roller(a, dx, g, 8, 6)
  flatRoof(a, x - 1, g - 12, w + 2, 2, ROOF.dark)
  if (auto) {
    // A stack of tyres by the door and a spanner on the fascia.
    a.stamp(rows('tyres', 'OOO', 'OuO', 'OOO', 'OuO', 'OOO'), x + w - 3, g - 5, L)
    a.stamp(rows('spanner', 'h.h', 'hhh', '.h.', '.h.'), x + (w >> 1) - 1, g - 16, L)
  }
  return finish(a)
}

/** A dry dock: a stone basin with a hull propped inside it and a crane over it. */
export function drydock(look: Look): Art {
  const w = W(look, 22)
  const { a, g, x } = plot(look, w)
  // The basin: stone sides, the floor in shadow.
  a.rect(x, g - 8, w, 8, C.grey4)
  a.rect(x, g - 8, 3, 8, C.grey7)
    .rect(x + w - 3, g - 8, 3, 8, C.grey6)
    .hline(x, g - 8, w, C.grey8)
  // The hull on its blocks.
  hull(a, x + 5, g - 2, w - 10, 3)
  for (let i = x + 6; i < x + w - 6; i += 4) a.vline(i, g - 2, 2, C.gold1)
  // The crane on the quay.
  const cx = x + w - 5
  a.vline(cx, g - 22, 14, C.gold4).vline(cx + 1, g - 22, 14, C.gold3)
  a.hline(cx - 10, g - 22, 13, C.gold4).hline(cx - 10, g - 21, 13, C.gold3)
  a.vline(cx - 9, g - 20, 5, C.grey3).rect(cx - 10, g - 15, 3, 2, C.grey6)
  return finish(a)
}

/**
 * A ship's hull seen from the side, its keel on row `g`: stage 1 is the keel alone, 2 the ribs standing on
 * it, 3 (or more) the planked hull.
 */
export function hull(a: Art, x: number, g: number, w: number, stage: number) {
  a.hline(x, g, w, C.gold1)
  a.set(x, g - 1, C.gold1)
    .set(x + w - 1, g - 1, C.gold1)
    .set(x - 1, g - 2, C.gold1)
    .set(x + w, g - 2, C.gold1)
  if (stage < 2) return
  if (stage === 2) {
    for (let i = x + 1; i < x + w - 1; i += 2) a.vline(i, g - 4, 4, C.gold3)
    return
  }
  for (let j = 1; j <= 4; j++) {
    const grow = j >= 3 ? 1 : 0
    a.hline(x - grow, g - j, w + grow * 2, j === 4 ? C.gold4 : j % 2 ? C.gold3 : C.gold2)
  }
  a.hline(x - 1, g - 5, w + 2, C.gold1)
}

/** A shipyard: a slip down to the water under a lifting frame, and on it whatever the yard has built so far. */
export function shipyard(look: Look): Art {
  const w = W(look, 12)
  const { a, g, x } = plot(look, w)
  // The slip: timbers laid toward the water at the right, and keel blocks on them.
  a.rect(x, g - 2, w, 2, C.tan2).hline(x, g - 2, w, C.tan3)
  for (let i = x + 1; i < x + w; i += 3) a.vline(i, g - 2, 2, C.gold1)
  a.rect(x + w, g - 1, 3, 1, C.blue3)
  const stage = look.state.startsWith('hull') ? Number(look.state.slice(4)) : 0
  if (stage) hull(a, x + 2, g - 3, w - 4, stage)
  else for (let i = x + 3; i < x + w - 2; i += 3) a.rect(i, g - 3, 2, 1, C.gold2)
  // The lifting frame: two legs, a beam, the tackle hanging from it.
  a.vline(x, g - 14, 12, C.gold2).vline(x + w - 1, g - 14, 12, C.gold1)
  a.hline(x - 1, g - 15, w + 2, C.gold3).hline(x - 1, g - 14, w + 2, C.gold1)
  a.set(x + 1, g - 13, C.gold1).set(x + w - 2, g - 13, C.gold1)
  a.vline(x + (w >> 1), g - 13, stage >= 3 ? 3 : 6, C.tan3).rect(
    x + (w >> 1) - 1,
    g - (stage >= 3 ? 10 : 7),
    3,
    1,
    C.grey7,
  )
  return finish(a)
}

/** A workshop: wide doors open on the bench, tools on the wall, the hammer for its sign. */
export function workshop(look: Look): Art {
  const w = W(look, 14)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.slate, WALL.wood, isLit(look))
  wall(a, x, g - 9, w, 9, WALL.wood)
  for (let j = g - 7; j < g - 1; j += 2) a.hline(x, j, w - 1, C.tan1)
  // The open doorway, the bench inside, and a saw hanging over it.
  a.rect(x + 2, g - 7, 9, 7, INK)
  a.hline(x + 3, g - 3, 7, C.gold3)
    .vline(x + 4, g - 2, 2, C.gold2)
    .vline(x + 8, g - 2, 2, C.gold2)
  a.stamp(rows('saw', 'ssss', 'e..s'), x + 4, g - 6, L)
  a.stamp(WINDOW.framed, x + w - 6, g - 7, L)
  slabRoof(a, x - 1, g - 15, w + 2, 6, ROOF.slate, 1)
  signboard(a, 'Workshop', x + (w >> 1) - 3, g - 18, L)
  return finish(a)
}
