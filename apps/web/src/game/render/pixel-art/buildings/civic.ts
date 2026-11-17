import { Art, C, CHIMNEY, DOOR, ROOF, WALL, WINDOW, finish, flatRoof, gable, isLit, legend, rows, slabRoof, wall } from './kit.ts'
import type { Look, Ramp } from './kit.ts'
import { plot, spread } from './house-forms.ts'
import { cone, dome } from './shapes.ts'

const W = (look: Look, least: number) => Math.max(least, look.fw * 8 - 2)

/** A row of `n` columns `h` tall standing on row `g`, in front of a shaded porch of colour `recess`. */
export function columns(a: Art, x: number, g: number, w: number, h: number, n: number, recess: number) {
  a.rect(x, g - h, w, h, recess)
  for (const colX of spread(x, w, n, 2)) {
    a.vline(colX, g - h, h, C.grey9).vline(colX + 1, g - h, h, C.grey7)
    a.hline(colX - 1, g - h, 4, C.grey9)
  }
}

/** Steps up to a building: `n` rows, each a pixel wider than the one above. */
export function stairs(a: Art, x: number, g: number, w: number, n: number) {
  for (let i = 0; i < n; i++) a.hline(x - i - 1, g - n + i, w + (i + 1) * 2, i % 2 ? C.grey7 : C.grey8)
}

/** A low triangular pediment over a front `w` wide, its base on row `y`. Returns the row of its tip. */
export function pediment(a: Art, x: number, y: number, w: number, roof: Ramp, tympanum: Ramp): number {
  const half = (w >> 1) + 1
  const top = y - Math.ceil(half / 2) - 1
  gable(a, x + (w >> 1) - 1, top, half, roof, tympanum, 2, true, 1)
  return top
}

/** A flag on a pole, the pole's foot at (x, y). */
export function flag(a: Art, x: number, y: number, colour: number, h = 7) {
  a.vline(x, y - h, h, C.grey6)
  a.rect(x + 1, y - h, 3, 2, colour).set(x + 4, y - h, colour)
}

/** A bank: a strong front of columns, a bronze door, a coin in the pediment. */
export function bank(look: Look): Art {
  const w = W(look, 22)
  const { a, g, x, cx } = plot(look, w)
  stairs(a, x, g, w, 2)
  columns(a, x, g - 2, w, 11, w >= 28 ? 6 : 4, C.grey5)
  a.rect(cx - 2, g - 10, 6, 8, C.gold2).rect(cx - 1, g - 9, 4, 7, C.gold3).vline(cx + 1, g - 9, 7, C.gold2).set(cx, g - 6, C.gold5)
  a.rect(x - 1, g - 15, w + 2, 2, C.grey9).hline(x - 1, g - 14, w + 2, C.grey7)
  const top = pediment(a, x, g - 15, w, ROOF.stone, WALL.stone)
  a.rect(cx, top + 4, 2, 2, C.gold5)
  return finish(a)
}

/** A courthouse: white stone, a portico at the middle, a cupola over it, and the scales. */
export function courthouse(look: Look): Art {
  const w = W(look, 22)
  const { a, g, x, cx } = plot(look, w)
  const L = legend(ROOF.copper, WALL.white, isLit(look))
  stairs(a, cx - 7, g, 16, 3)
  wall(a, x, g - 16, w, 13, WALL.white, false)
  a.hline(x, g - 3, w, C.grey7)
  for (const wx of spread(x, w, 4, 4)) if (Math.abs(wx + 2 - cx) > 7) a.stamp(WINDOW.arch, wx, g - 13, L)
  columns(a, cx - 6, g - 3, 14, 11, 4, C.grey6)
  a.stamp(DOOR.double, cx - 2, g - 10, L)
  a.rect(x - 1, g - 18, w + 2, 2, C.grey9).hline(x - 1, g - 17, w + 2, C.grey7)
  pediment(a, cx - 7, g - 18, 16, ROOF.copper, WALL.white)
  // The cupola: a little drum and dome, with a gilt finial.
  a.rect(cx - 2, g - 27, 6, 3, C.grey9).vline(cx + 3, g - 27, 3, C.grey7)
  dome(a, cx, g - 30, 3, ROOF.copper)
  a.vline(cx, g - 33, 3, C.gold4)
  // The scales, on the pediment.
  a.stamp(rows('scales', 'YYYYY', 'Y.Y.Y', 'y.Y.y'), cx - 2, g - 22, L)
  return finish(a)
}

/** A city hall: two floors of tall windows and a clock tower flying the flag. */
export function cityHall(look: Look): Art {
  const w = W(look, 22)
  const { a, g, x, cx } = plot(look, w)
  const L = legend(ROOF.slate, WALL.plaster, isLit(look))
  wall(a, x, g - 14, w, 14, WALL.plaster)
  a.hline(x, g - 7, w, C.tan4).hline(x, g - 1, w, C.grey7)
  for (const wx of spread(x, w, 4, 4)) {
    a.stamp(WINDOW.arch, wx, g - 13, L)
    if (Math.abs(wx + 2 - cx) > 4) a.stamp(WINDOW.arch, wx, g - 6, L)
  }
  a.stamp(DOOR.double, cx - 2, g - 7, L)
  slabRoof(a, x - 1, g - 20, w + 2, 6, ROOF.slate, 2)
  // The tower, with its clock and its steep roof.
  wall(a, cx - 3, g - 31, 8, 13, WALL.plaster, false)
  a.rect(cx - 2, g - 29, 6, 6, C.grey9).rect(cx - 1, g - 28, 4, 4, C.grey9)
  a.hline(cx - 1, g - 30, 4, C.gold1).hline(cx - 1, g - 23, 4, C.gold1).vline(cx - 3, g - 28, 4, C.gold1).vline(cx + 4, g - 28, 4, C.gold1)
  a.vline(cx, g - 28, 3, C.grey2).hline(cx, g - 26, 2, C.grey2)
  cone(a, cx, g - 38, 10, 7, ROOF.slate, 2, false)
  flag(a, cx, g - 38, C.red4, 6)
  return finish(a)
}

/** A library: a stone reading hall with tall arched windows full of books and a lantern on its roof. */
export function library(look: Look): Art {
  const w = W(look, 22)
  const { a, g, x, cx } = plot(look, w)
  const L = legend(ROOF.slate, WALL.stone, isLit(look))
  stairs(a, cx - 3, g, 8, 2)
  wall(a, x, g - 15, w, 13, WALL.stone)
  a.hline(x, g - 3, w, C.grey6)
  const spines = [C.red3, C.blue3, C.gold4, C.green2, C.plum2]
  spread(x, w, 4, 5).forEach((wx, i) => {
    if (Math.abs(wx + 2 - cx) < 5) return
    // An arched window, and the shelves behind it.
    a.rect(wx, g - 12, 5, 9, C.gold1).hline(wx + 1, g - 13, 3, C.gold1)
    for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) a.vline(wx + 1 + k, g - 11 + j * 3, 2, isLit(look) && j === 0 ? C.gold5 : spines[(i + j * 2 + k) % 5])
  })
  a.stamp(DOOR.double, cx - 2, g - 9, L)
  slabRoof(a, x - 1, g - 22, w + 2, 7, ROOF.slate, 3)
  // The lantern over the reading room.
  a.rect(cx - 2, g - 26, 6, 4, C.grey8).rect(cx - 1, g - 25, 4, 2, L.w).hline(cx - 3, g - 27, 8, C.blue2).hline(cx - 2, g - 28, 6, C.blue3)
  return finish(a)
}

/** A museum: a long colonnade, banners between the columns, a low dome over the hall. */
export function museum(look: Look): Art {
  const w = W(look, 30)
  const { a, g, x, cx } = plot(look, w)
  const L = legend(ROOF.copper, WALL.stone, isLit(look))
  stairs(a, x, g, w, 3)
  columns(a, x, g - 3, w, 12, Math.floor(w / 5), C.grey5)
  a.stamp(DOOR.double, cx - 2, g - 10, L)
  // Banners for the exhibitions, hung between the columns.
  a.rect(x + 6, g - 13, 2, 7, C.red3).rect(x + w - 8, g - 13, 2, 7, C.blue3)
  a.rect(x - 1, g - 17, w + 2, 2, C.grey9).hline(x - 1, g - 16, w + 2, C.grey7)
  // The attic storey and the dome.
  wall(a, x + 2, g - 22, w - 4, 5, WALL.stone, false)
  a.hline(x + 1, g - 23, w - 2, C.grey9)
  for (const wx of spread(x + 2, w - 4, 5, 2)) a.rect(wx, g - 21, 2, 2, L.x)
  dome(a, cx, g - 31, 8, ROOF.copper)
  a.vline(cx, g - 34, 3, C.gold4)
  return finish(a)
}

/** A school: red brick, big windows, a bell in a turret over the door, and a flag in the yard. */
export function school(look: Look): Art {
  const w = W(look, 30)
  const { a, g, x, cx } = plot(look, w)
  const L = legend(ROOF.tile, WALL.brick, isLit(look))
  wall(a, x, g - 15, w, 15, WALL.brick)
  a.hline(x, g - 8, w, C.red2).hline(x, g - 1, w, C.grey5)
  for (const wx of spread(x, w, Math.floor(w / 7), 4)) {
    a.stamp(WINDOW.sash, wx, g - 14, L)
    if (Math.abs(wx + 2 - cx) > 6) a.stamp(WINDOW.sash, wx, g - 7, L)
  }
  slabRoof(a, x - 1, g - 22, w + 2, 7, ROOF.tile, 2)
  // The entrance gable and the bell turret above it.
  gable(a, cx, g - 26, 8, ROOF.tile, WALL.brick, 2)
  wall(a, cx - 5, g - 17, 12, 17, WALL.brick, false)
  a.stamp(WINDOW.round, cx - 1, g - 16, L).stamp(DOOR.double, cx - 2, g - 7, L)
  a.vline(cx - 2, g - 31, 5, C.grey9).vline(cx + 3, g - 31, 5, C.grey9)
  a.rect(cx, g - 30, 2, 2, C.gold5).set(cx, g - 28, C.gold3)
  cone(a, cx, g - 35, 8, 4, ROOF.tile, 2, false)
  flag(a, x + w + 1, g, C.blue3, 12)
  return finish(a)
}

/** A university: a domed hall between two arcaded wings, with a quad of grass in front. */
export function university(look: Look): Art {
  const w = W(look, 38)
  const { a, g, x, cx } = plot(look, w)
  const L = legend(ROOF.plum, WALL.stone, isLit(look))
  const wing = Math.floor((w - 16) / 2)
  for (const wx of [x, x + w - wing]) {
    wall(a, wx, g - 14, wing, 14, WALL.stone)
    a.hline(wx, g - 7, wing, C.grey6)
    for (const px of spread(wx, wing, Math.floor(wing / 5), 3)) {
      a.stamp(rows('win', 'fff', 'fwx', 'fxx'), px, g - 13, L)
      // The arcade: an arch under each window.
      a.rect(px, g - 5, 3, 5, C.grey4).hline(px, g - 6, 3, C.grey5).set(px, g - 6, C.grey7).set(px + 2, g - 6, C.grey7)
    }
    slabRoof(a, wx - 1, g - 20, wing + 2, 6, ROOF.plum, 2)
  }
  // The great hall: taller, with columns at the door and a dome on a drum.
  wall(a, cx - 7, g - 22, 16, 22, WALL.stone, false)
  columns(a, cx - 6, g, 14, 12, 4, C.grey5)
  a.stamp(DOOR.double, cx - 2, g - 7, L)
  a.rect(cx - 8, g - 14, 18, 2, C.grey9).hline(cx - 8, g - 13, 18, C.grey7)
  a.stamp(WINDOW.round, cx - 1, g - 20, L)
  a.rect(cx - 8, g - 24, 18, 2, C.grey9).hline(cx - 8, g - 23, 18, C.grey7)
  a.rect(cx - 5, g - 28, 12, 4, C.grey8).rect(cx + 5, g - 28, 2, 4, C.grey6)
  for (let i = cx - 4; i < cx + 6; i += 3) a.rect(i, g - 27, 1, 2, L.x)
  dome(a, cx, g - 35, 7, ROOF.plum)
  a.vline(cx, g - 39, 4, C.gold4).set(cx + 1, g - 39, C.gold5)
  return finish(a)
}

/** A stadium: the bowl seen from above the near stand, the pitch in the middle, lights at the corners. */
export function stadium(look: Look): Art {
  const w = W(look, 38)
  const { a, g, x, cx } = plot(look, w)
  const half = w >> 1
  const depth = Math.min(30, look.fh * 5)
  const top = g - depth - 4
  // The bowl: an ellipse of stands, banded in the colours of the seats.
  for (let j = 0; j < depth; j++) {
    const t = (j + 0.5) / depth
    const hw = Math.round(half * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)))
    for (let i = -hw + 1; i <= hw; i++) {
      const d = Math.hypot(i / half, (2 * t - 1) * 1.0)
      let c: number = C.green3
      if (d > 0.9) c = C.grey8
      else if (d > 0.74) c = C.red4
      else if (d > 0.58) c = C.blue3
      else if (d > 0.5) c = C.grey9
      a.set(cx + i, top + j, c)
    }
  }
  // The pitch markings.
  a.vline(cx, top + Math.round(depth * 0.3), Math.round(depth * 0.4), C.green4)
  a.rect(cx - 1, top + (depth >> 1) - 1, 3, 2, C.green4)
  // The outer wall along the near side, arched.
  for (let j = 0; j < 5; j++) {
    const hw = Math.round(half * Math.sqrt(Math.max(0, 1 - ((depth - 6 + j * 1.2) / depth) ** 2)))
    for (let i = -hw + 1; i <= hw; i++) a.set(cx + i, g - 5 + j, j === 0 ? C.grey9 : i > hw * 0.6 ? C.grey6 : C.grey7)
  }
  for (let i = -half + 6; i < half - 4; i += 4) a.rect(cx + i, g - 3, 2, 3, C.grey4)
  // Floodlights on masts at the four corners.
  for (const [mx, my] of [
    [x + 2, top + 6],
    [x + w - 3, top + 6],
    [x + 2, g - 4],
    [x + w - 3, g - 4],
  ] as const) {
    a.vline(mx, my - 9, 9, C.grey5)
    a.rect(mx - 1, my - 11, 3, 2, isLit(look) ? C.gold5 : C.grey9)
  }
  return finish(a)
}

/** A train station: the booking hall with its clock, a glazed train shed beside it, and the track. */
export function trainStation(look: Look): Art {
  const w = W(look, 30)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.slate, WALL.brick, isLit(look))
  const hallW = Math.round(w * 0.45)
  const track = 3
  const gy = g - track
  // The track: sleepers and two rails across the whole front.
  a.rect(x - 2, gy, w + 4, track, C.tan1)
  for (let i = x - 2; i < x + w + 2; i += 3) a.vline(i, gy, track, C.gold1)
  a.hline(x - 2, gy, w + 4, C.grey7).hline(x - 2, gy + 2, w + 4, C.grey7)
  // The train shed: iron arches glazed over, open at the front.
  const sx = x + hallW
  const sw = w - hallW
  a.rect(sx, gy - 9, sw, 9, C.grey3)
  for (let j = 0; j < 6; j++) {
    const inset = j < 2 ? 2 - j : 0
    a.hline(sx + inset, gy - 15 + j, sw - inset, j === 0 ? C.blue5 : j % 2 ? C.blue4 : C.blue3)
  }
  for (let i = sx + 3; i < sx + sw; i += 4) a.vline(i, gy - 15, 15, C.grey5)
  a.hline(sx, gy - 9, sw, C.grey5).rect(sx, gy - 2, sw, 2, C.grey7)
  // The booking hall.
  wall(a, x, gy - 14, hallW, 14, WALL.brick)
  for (const wx of spread(x, hallW, 2, 4)) a.stamp(WINDOW.arch, wx, gy - 12, L)
  a.stamp(DOOR.double, x + (hallW >> 1) - 3, gy - 7, L)
  slabRoof(a, x - 1, gy - 20, hallW + 2, 6, ROOF.slate, 1)
  const cxh = x + (hallW >> 1) - 1
  gable(a, cxh, gy - 26, 5, ROOF.slate, WALL.brick, 2)
  a.rect(cxh - 1, gy - 22, 4, 4, C.grey9).vline(cxh, gy - 21, 2, C.grey2).set(cxh + 1, gy - 20, C.grey2)
  a.stamp(CHIMNEY.brick, x + 1, gy - 23, L)
  return finish(a)
}

/** A police station: a brick block with a blue lamp over the door and a badge on the wall. */
export function policeStation(look: Look): Art {
  const w = W(look, 14)
  const { a, g, x, cx } = plot(look, w)
  const L = legend(ROOF.slate, WALL.concrete, isLit(look))
  wall(a, x, g - 11, w, 11, WALL.concrete, false)
  a.rect(x, g - 11, w, 3, C.blue2).hline(x, g - 9, w, C.blue1)
  for (const wx of spread(x, w, w >= 20 ? 3 : 2, 4)) if (Math.abs(wx + 2 - cx) > 3) a.stamp(WINDOW.framed, wx, g - 7, L)
  a.stamp(DOOR.glass, cx - 1, g - 5, L)
  flatRoof(a, x - 1, g - 13, w + 2, 2, ROOF.stone)
  // The lamp, blue by day and lit at night, and the badge.
  a.rect(cx, g - 8, 2, 2, isLit(look) ? C.blue5 : C.blue4)
  a.stamp(rows('badge', 'YYY', 'YYY', '.Y.'), x + 2, g - 11, L)
  a.vline(x + w - 3, g - 19, 6, C.grey5).set(x + w - 3, g - 20, C.red4)
  return finish(a)
}

/** A fire station: red doors for the engines, a hose tower with a bell. */
export function fireStation(look: Look): Art {
  const w = W(look, 14)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.dark, WALL.brick, isLit(look))
  const tw = 7
  wall(a, x, g - 10, w - tw, 10, WALL.brick, false)
  // The engine doors: tall, red, with a row of little panes.
  for (const dx of spread(x, w - tw, w - tw >= 14 ? 2 : 1, 6)) {
    a.rect(dx, g - 8, 6, 8, C.red3).rect(dx, g - 8, 6, 1, C.grey9).hline(dx + 1, g - 6, 4, L.w).vline(dx + 3, g - 8, 8, C.red2)
  }
  flatRoof(a, x - 1, g - 12, w - tw + 2, 2, ROOF.dark)
  // The tower.
  wall(a, x + w - tw, g - 20, tw, 20, WALL.brick, false)
  a.stamp(WINDOW.slit, x + w - 4, g - 15, L).stamp(DOOR.low, x + w - 5, g - 4, L)
  a.rect(x + w - tw - 1, g - 22, tw + 2, 2, C.grey9).hline(x + w - tw - 1, g - 21, tw + 2, C.grey7)
  a.vline(x + w - tw, g - 25, 3, C.grey5).vline(x + w - 1, g - 25, 3, C.grey5)
  a.rect(x + w - 5, g - 25, 3, 2, C.gold5).hline(x + w - tw - 1, g - 26, tw + 2, C.red4)
  return finish(a)
}
