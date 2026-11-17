import { Art, C, DOOR, ROOF, WALL, WINDOW, finish, gable, isLit, legend, rows, wall } from './kit.ts'
import type { Look, Ramp } from './kit.ts'
import { plot, spread } from './house-forms.ts'
import { columns, pediment, stairs } from './civic.ts'
import { cone, dome, drum, steps } from './shapes.ts'

const W = (look: Look, least: number) => Math.max(least, look.fw * 8 - 2)
const GILT: Ramp = [C.gold5, C.gold4, C.gold3, C.gold2]

/** A temple on its stepped plinth: a hall of columns under a green roof, a gilded finial on the ridge. */
export function temple(look: Look): Art {
  const w = W(look, 22)
  const { a, g, x, cx } = plot(look, w)
  const L = legend(ROOF.copper, WALL.stone, isLit(look))
  const plinth = w >= 30 ? 3 : 2
  steps(a, x - 3, g - plinth * 2, w + 6, plinth, 2, 2, WALL.stone)
  // The stair up the middle of the plinth.
  for (let i = 0; i < plinth * 2; i++) a.hline(cx - 2, g - plinth * 2 + i, 6, i % 2 ? C.grey6 : C.grey8)
  const base = g - plinth * 2
  const colH = w >= 30 ? 13 : 9
  columns(a, x + 2, base, w - 4, colH, Math.max(4, Math.floor(w / 6)), C.grey5)
  a.rect(cx - 1, base - 7, 4, 7, C.gold0).hline(cx - 1, base - 7, 4, C.gold3)
  if (isLit(look)) a.rect(cx, base - 5, 2, 4, C.gold4)
  a.rect(x + 1, base - colH - 2, w - 2, 2, C.grey9).hline(x + 1, base - colH - 1, w - 2, C.grey7)
  const top = pediment(a, x + 1, base - colH - 2, w - 2, ROOF.copper, WALL.stone)
  a.stamp(rows('sun', '.Y.', 'YyY', '.Y.'), cx - 1, top + 4, L)
  a.vline(cx, top - 3, 3, C.gold4).set(cx + 1, top - 3, C.gold5)
  a.set(x + 1, base - colH - 4, C.gold4).set(x + w - 2, base - colH - 4, C.gold4)
  return finish(a)
}

/** A cathedral: two towers with spires, a rose window over the great door, the nave rising between. */
export function cathedral(look: Look): Art {
  const w = W(look, 30)
  const { a, g, x, cx } = plot(look, w)
  const L = legend(ROOF.slate, WALL.stone, isLit(look))
  const tw = Math.max(9, Math.round(w * 0.26))
  const towerH = Math.min(36, look.fh * 6)
  const naveW = w - tw * 2
  // The nave front.
  const naveH = Math.round(towerH * 0.72)
  wall(a, x + tw, g - naveH, naveW, naveH, WALL.stone, false)
  gable(a, cx, g - naveH - (naveW >> 1) - 2, (naveW >> 1) + 1, ROOF.slate, WALL.stone, 2)
  // The rose window: a wheel of coloured glass.
  const ry = g - naveH + 2
  a.stamp(
    rows('rose', '..kkk..', '.kRlYk.', 'kRlklNk', 'klkYklk', 'kPlklRk', '.kNlPk.', '..kkk..'),
    cx - 2,
    ry,
    isLit(look) ? { ...L, l: C.gold5 } : L,
  )
  // The great door, in a pointed arch.
  a.rect(cx - 3, g - 10, 8, 10, C.grey5)
    .rect(cx - 2, g - 11, 6, 1, C.grey5)
    .rect(cx - 1, g - 12, 4, 1, C.grey5)
  a.rect(cx - 2, g - 9, 6, 9, C.gold1)
    .rect(cx - 1, g - 10, 4, 1, C.gold1)
    .vline(cx, g - 9, 9, C.gold2)
    .vline(cx + 1, g - 9, 9, C.gold0)
  // The towers: belfry openings, buttress lines, and spires with a cross.
  for (const tx of [x, x + w - tw]) {
    wall(a, tx, g - towerH, tw, towerH, WALL.stone, false)
    a.vline(tx, g - towerH, towerH, C.grey9)
    const mid = tx + (tw >> 1)
    a.stamp(rows('belfry', '.kk.', 'kkkk', 'kkkk', 'kkkk', 'kkkk'), mid - 2, g - towerH + 3, L)
    a.stamp(WINDOW.slit, mid, g - towerH + 12, L).stamp(WINDOW.slit, mid, g - Math.round(towerH * 0.4), L)
    a.hline(tx, g - towerH + 10, tw, C.grey6).hline(tx, g - Math.round(towerH * 0.5), tw, C.grey6)
    a.hline(tx - 1, g - towerH - 1, tw + 2, C.grey9)
    cone(a, mid - 1, g - towerH - 1 - 13, tw + 2, 13, ROOF.slate, 1, false)
    a.vline(mid - 1, g - towerH - 18, 4, C.gold4).hline(mid - 2, g - towerH - 17, 3, C.gold4)
  }
  return finish(a)
}

/** A mosque: a white prayer hall under a great dome, a minaret beside it, the crescent over all. */
export function mosque(look: Look): Art {
  const w = W(look, 22)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.copper, WALL.plaster, isLit(look))
  const hallW = w - 8
  const hx = x
  const hc = hx + (hallW >> 1) - 1
  wall(a, hx, g - 13, hallW, 13, WALL.plaster, false)
  a.hline(hx - 1, g - 14, hallW + 2, C.grey9).hline(hx - 1, g - 13, hallW + 2, C.tan4)
  // Pointed arches: the door at the middle, a window each side.
  for (const ax of spread(hx, hallW, 3, 4)) {
    const door = Math.abs(ax + 2 - hc) < 3
    a.rect(ax, g - (door ? 8 : 9), 4, door ? 8 : 5, door ? C.gold1 : L.x).hline(
      ax + 1,
      g - (door ? 9 : 10),
      2,
      door ? C.gold1 : L.w,
    )
    if (!door) a.hline(ax, g - 9, 4, L.w)
  }
  const r = hallW >= 20 ? 8 : 6
  a.rect(hc - r + 2, g - 17, r * 2 - 2, 3, C.grey9).vline(hc + r - 1, g - 17, 3, C.tan4)
  dome(a, hc, g - 17 - r, r, ROOF.copper)
  a.vline(hc, g - 17 - r - 3, 3, C.gold4)
  a.stamp(rows('crescent', 'Y.', '.Y', 'Y.'), hc + 1, g - 17 - r - 5, L)
  // The minaret: a slim tower with a gallery near the top and a pointed cap.
  const mx = x + w - 5
  const mh = Math.min(look.fh * 8 + 8, 13 + r + 12)
  drum(a, mx, g - mh, 4, mh, WALL.plaster)
  a.hline(mx - 1, g - mh + 5, 6, C.grey9).hline(mx - 1, g - mh + 6, 6, C.tan3)
  a.set(mx + 1, g - mh + 2, C.gold0).set(mx + 2, g - mh + 2, C.gold0)
  cone(a, mx + 1, g - mh - 5, 6, 5, ROOF.copper, 1, false)
  a.set(mx + 1, g - mh - 6, C.gold4)
  return finish(a)
}

/** A synagogue: a stone hall with two tall arched windows, a round window, and a blue dome. */
export function synagogue(look: Look): Art {
  const w = W(look, 14)
  const { a, g, x, cx } = plot(look, w)
  const L = legend(ROOF.slate, WALL.stone, isLit(look))
  wall(a, x, g - 15, w, 15, WALL.stone, false)
  a.rect(x - 1, g - 17, w + 2, 2, C.grey9).hline(x - 1, g - 16, w + 2, C.grey7)
  for (const wx of [x + 2, x + w - 6])
    a.rect(wx, g - 12, 4, 8, L.x)
      .hline(wx + 1, g - 13, 2, L.w)
      .hline(wx, g - 12, 4, L.w)
      .vline(wx + 1, g - 12, 8, C.grey8)
  a.stamp(WINDOW.round, cx - 1, g - 14, L).stamp(DOOR.double, cx - 2, g - 7, L)
  dome(a, cx, g - 17 - 6, 6, ROOF.slate)
  // The star over the dome: two small triangles, one on the other.
  a.stamp(rows('star', '.Y.', 'YYY', '.Y.', 'YYY', '.Y.'), cx - 1, g - 28, L)
  return finish(a)
}

/** A pagoda: three red storeys, each under a dark roof that turns up at the corners. */
export function pagoda(look: Look): Art {
  const w = W(look, 14)
  const { a, g, cx } = plot(look, w)
  const L = legend(ROOF.dark, WALL.brick, isLit(look))
  const tiers = look.fh >= 3 ? 3 : 2
  let y = g
  for (let t = 0; t < tiers; t++) {
    const tw = w - t * 6
    const tx = cx - (tw >> 1) + 1
    const th = t === 0 ? 7 : 5
    a.rect(tx, y - th, tw, th, C.red3)
      .vline(tx + tw - 1, y - th, th, C.red2)
      .hline(tx, y - th, tw, C.red1)
    // Posts, and a lit paper window between them.
    for (let i = tx + 1; i < tx + tw - 1; i += 3) a.vline(i, y - th + 1, th - 1, C.red4)
    if (t === 0) a.stamp(DOOR.low, cx - 1, y - 4, L)
    else a.rect(cx, y - th + 2, 2, 2, isLit(look) ? C.gold5 : C.tan5)
    // The roof: wider than the storey, its ends a pixel higher than its middle.
    const ry = y - th - 3
    a.rect(tx - 2, ry + 1, tw + 4, 2, C.grey4)
      .hline(tx - 1, ry, tw + 2, C.grey5)
      .hline(tx - 2, ry + 2, tw + 4, C.grey3)
    a.set(tx - 3, ry, C.grey5)
      .set(tx + tw + 2, ry, C.grey4)
      .set(tx - 3, ry + 1, C.grey4)
      .set(tx + tw + 2, ry + 1, C.grey3)
    y = ry
  }
  a.vline(cx, y - 5, 5, C.gold4)
    .vline(cx + 1, y - 4, 4, C.gold3)
    .set(cx, y - 6, C.gold5)
  return finish(a)
}

/** A stupa: a white dome on a square terrace, with a gilded spire of rings. */
export function stupa(look: Look): Art {
  const w = W(look, 12)
  const { a, g, cx } = plot(look, w)
  const r = w >= 20 ? 8 : 6
  a.rect(cx - r, g - 3, r * 2 + 2, 3, C.grey8)
    .hline(cx - r, g - 3, r * 2 + 2, C.grey9)
    .vline(cx + r + 1, g - 2, 2, C.grey6)
  dome(a, cx, g - 3 - r, r, [C.grey9, C.grey9, C.grey8, C.grey7])
  // A band of ochre round the dome, as they are painted.
  for (let i = -r + 2; i <= r - 1; i++) if (a.get(cx + i, g - 5)) a.set(cx + i, g - 5, C.gold4)
  a.rect(cx - 1, g - 6 - r, 4, 3, GILT[1]).vline(cx + 2, g - 6 - r, 3, GILT[2])
  a.vline(cx, g - 12 - r, 6, GILT[1]).vline(cx + 1, g - 11 - r, 5, GILT[2])
  a.hline(cx - 1, g - 9 - r, 4, GILT[0]).set(cx, g - 13 - r, GILT[0])
  return finish(a)
}

/** A mausoleum: a small marble tomb, columns at its door, a dome over it. */
export function mausoleum(look: Look): Art {
  const w = W(look, 12)
  const { a, g, x, cx } = plot(look, w)
  stairs(a, x, g, w, 1)
  columns(a, x, g - 1, w, 8, 4, C.grey5)
  a.rect(cx, g - 6, 2, 5, C.gold0)
  a.rect(x - 1, g - 11, w + 2, 2, C.grey9).hline(x - 1, g - 10, w + 2, C.grey7)
  dome(a, cx, g - 11 - 5, 5, [C.grey9, C.grey9, C.grey8, C.grey7])
  a.vline(cx, g - 18, 2, C.gold4)
  return finish(a)
}
