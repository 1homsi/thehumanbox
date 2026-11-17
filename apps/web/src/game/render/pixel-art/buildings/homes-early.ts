import { Art, C, ROOF, WALL, finish, gable, legend, rows, slabRoof, wall } from './kit.ts'
import type { Look, Ramp, RoofName } from './kit.ts'
import { cone, dome } from './shapes.ts'

/** Sun-dried mud brick: warmer and darker than daub, so it stands off the sand it is built on. */
const MUD: Ramp = [C.tan4, C.tan3, C.tan2, C.tan1]
/** The first roofs are what grows nearby: a tribe's colour picks straw, moss, hide or bark. */
const EARLY_ROOF: Record<RoofName | '', Ramp> = {
  '': ROOF.straw,
  straw: ROOF.straw,
  moss: ROOF.moss,
  slate: ROOF.hide,
  tile: ROOF.wood,
  wood: ROOF.wood,
  stone: ROOF.stone,
  hide: ROOF.hide,
  plum: ROOF.wood,
  copper: ROOF.moss,
  dark: ROOF.wood,
  snow: ROOF.snow,
}

export const earlyRoof = (look: Look): Ramp => EARLY_ROOF[look.roof ?? '']

/** 0 for a one-tile hut, 1 for a two-tile home, 2 for anything wider. */
const sizeOf = (look: Look) => (look.fw <= 1 ? 0 : look.fw === 2 ? 1 : 2)

/** A dark doorway `w` wide and `h` tall with its lintel, standing on row `g`. */
function doorway(a: Art, x: number, g: number, w: number, h: number) {
  a.rect(x, g - h, w, h, C.gold0)
  a.hline(x, g - h, w, C.gold1)
}

/** A round house: a daub drum under a tall cone of thatch. */
function roundHouse(look: Look, roof: Ramp, wallRamp: Ramp = WALL.daub): Art {
  const [w, ch, wh, dw] = (
    [
      [8, 5, 3, 2],
      [14, 8, 5, 2],
      [22, 12, 6, 4],
    ] as const
  )[sizeOf(look)]
  const a = new Art(w + 8, ch + wh + 6)
  const cx = (a.w >> 1) - 1
  const top = 3
  const g = top + ch + wh
  wall(a, cx - w / 2 + 2, g - wh, w - 2, wh, wallRamp)
  cone(a, cx, top, w + 2, ch, roof)
  // Two strands of straw catch the light down the lit side: drawn, not scattered.
  if (w >= 14) {
    for (let j = 2; j < ch - 2; j++) a.set(cx - (j >> 1) - 1, top + j, roof[1])
    for (let j = 4; j < ch - 1; j++) a.set(cx + (j >> 2) + 1, top + j, roof[3])
  }
  doorway(a, cx - (dw >> 1) + 1, g, dw, Math.min(wh, 5))
  return finish(a)
}

/** A hide tent: skins over poles that cross above the smoke hole. */
function tent(look: Look): Art {
  const [w, h] = (
    [
      [8, 8],
      [14, 12],
      [20, 16],
    ] as const
  )[sizeOf(look)]
  const a = new Art(w + 8, h + 8)
  const cx = (a.w >> 1) - 1
  const top = 4
  cone(a, cx, top, w, h, ROOF.hide, 2, false)
  // Poles above the hides.
  a.set(cx - 1, top - 2, C.gold1)
    .set(cx, top - 1, C.gold1)
    .set(cx + 2, top - 2, C.gold1)
    .set(cx + 1, top - 1, C.gold1)
  // The door flap: a dark wedge, widening to the ground.
  const flap = Math.max(3, Math.round(h * 0.55))
  for (let j = 0; j < flap; j++) {
    const half = 1 + Math.floor((j * (w >= 14 ? 2 : 1)) / flap)
    for (let i = -half + 1; i <= half; i++) a.set(cx + i, top + h - flap + j, C.gold0)
  }
  // A band of paint across the skins.
  if (w >= 14) {
    const j = Math.round(h * 0.35)
    const half = Math.round((2 + ((w - 2) * j) / (h - 1)) / 2)
    for (let i = -half + 2; i <= half - 1; i++)
      if (a.get(cx + i, top + j) !== C.gold0) a.set(cx + i, top + j, C.red3)
  }
  return finish(a)
}

/** An igloo: a dome of snow blocks with a low tunnel for a door. */
function igloo(look: Look): Art {
  const r = [4, 7, 10][sizeOf(look)]
  const a = new Art(r * 2 + 10, r + 8)
  const cx = (a.w >> 1) - 1
  const top = 3
  const ice: Ramp = [C.grey9, C.grey9, C.blue5, C.blue4]
  dome(a, cx, top, r, ice)
  // Courses of snow blocks: a joint line every other row, the uprights staggered.
  for (let j = 2; j < r; j += 2) {
    for (let i = -r; i <= r; i++) {
      const c = a.get(cx + i, top + j)
      if (c === C.grey9) a.set(cx + i, top + j, C.blue5)
    }
    if (r >= 7)
      for (let i = -r + ((j >> 1) % 2) * 2 + 1; i <= r; i += 4)
        if (a.get(cx + i, top + j + 1) === C.grey9) a.set(cx + i, top + j + 1, C.blue5)
  }
  // The entrance tunnel, a smaller arch at the foot.
  const tw = r >= 7 ? 3 : 2
  const g = top + r
  a.rect(cx - tw + 1, g - tw - 1, tw * 2, tw + 1, C.grey9)
  a.hline(cx - tw + 2, g - tw - 2, tw * 2 - 2, C.grey9)
  a.rect(cx - tw + 2, g - tw, tw * 2 - 2, tw, C.blue1)
  a.hline(cx - tw + 2, g - tw, tw * 2 - 2, C.blue2)
  return finish(a)
}

/** A mud-brick house: flat roof behind a parapet, beam ends under it, a white dome, a courtyard wall. */
function adobe(look: Look): Art {
  const size = sizeOf(look)
  const [w, h, r] = (
    [
      [9, 5, 2],
      [14, 7, 3],
      [22, 9, 4],
    ] as const
  )[size]
  const a = new Art(w + 12, h + 14)
  const x = 4
  const g = a.h - 2
  const y = g - h
  a.rect(x, y, w, h, MUD[0])
  a.vline(x + w - 1, y, h, MUD[1])
  a.hline(x, y, w, C.tan5)
  a.hline(x, g - 1, w, MUD[2])
  // Roof beams poke through the wall under the parapet.
  if (size > 0) for (let i = 2; i < w - 2; i += 3) a.set(x + i, y + 2, C.gold1)
  dome(a, x + w - r - 2, y - r, r, [C.grey9, C.grey9, C.grey8, C.grey7])
  doorway(a, x + 2, g, size === 2 ? 3 : 2, size === 0 ? 3 : 4)
  if (size > 0) a.rect(x + w - 5, y + (size === 2 ? 4 : 3), 2, 2, C.gold0)
  if (size === 2) {
    // A second, higher room at the left, as these houses grow: one more box on the roof.
    a.rect(x, y - 5, 9, 5, MUD[0])
    a.vline(x + 8, y - 5, 5, MUD[1])
    a.hline(x, y - 5, 9, C.tan5)
    a.rect(x + 3, y - 3, 2, 2, C.gold0)
    // The low courtyard wall in front, with its gap.
    a.rect(x + w, g - 3, 5, 3, MUD[1])
    a.hline(x + w, g - 3, 5, MUD[0])
  }
  return finish(a)
}

/** A thatched house on stilts over the marsh, with a ladder to its door. */
function stiltHouse(look: Look): Art {
  const size = sizeOf(look)
  const [w, rh, wh, legs] = (
    [
      [8, 4, 3, 2],
      [14, 6, 4, 3],
      [22, 7, 5, 4],
    ] as const
  )[size]
  const a = new Art(w + 8, rh + wh + legs + 8)
  const x = 4
  const top = 3
  const wy = top + rh
  wall(a, x, wy, w, wh, WALL.wood)
  slabRoof(a, x - 1, top, w + 2, rh, ROOF.straw, 2, size > 0)
  doorway(a, x + (size === 0 ? 3 : 3), wy + wh, 2, wh - 1)
  // The platform, and the stilts under it.
  a.hline(x - 1, wy + wh, w + 2, C.gold2)
  for (let i = 0; i < w; i += size === 0 ? 3 : 4)
    a.vline(x + i + (size === 0 ? 1 : 1), wy + wh + 1, legs, C.gold1)
  if (size > 0) {
    // The ladder: two rails and its rungs.
    const lx = x + 2
    a.vline(lx, wy + wh + 1, legs, C.gold3).vline(lx + 3, wy + wh + 1, legs, C.gold3)
    for (let j = 1; j < legs; j += 2) a.hline(lx + 1, wy + wh + j, 2, C.gold3)
  }
  return finish(a)
}

/** A turf hall: a long low house under a roof of living grass. */
function turfHall(look: Look, snowy = false): Art {
  const size = sizeOf(look)
  const [w, rh, wh] = (
    [
      [9, 4, 2],
      [15, 6, 3],
      [23, 7, 4],
    ] as const
  )[size]
  const a = new Art(w + 8, rh + wh + 8)
  const x = 4
  const top = 3
  wall(a, x + 1, top + rh, w - 2, wh, WALL.darkStone, false)
  slabRoof(a, x, top, w, rh, WALL.turf, size === 0 ? 1 : 3, false)
  if (snowy) {
    // On the tundra the turf lies under snow: the top of the roof is white, the grass shows at the eaves.
    for (let j = 0; j < Math.max(2, rh - 3); j++)
      for (let i = 0; i < w; i++)
        if (a.get(x + i, top + j))
          a.set(x + i, top + j, j === Math.max(2, rh - 3) - 1 && i % 3 === 0 ? C.grey8 : C.grey9)
  }
  // Tufts along the ridge, and one line of sod.
  if (!snowy) for (let i = 4; i < w - 4; i += 3) a.set(x + i, top - 1, C.green3)
  if (size > 0) for (let i = 3; i < w - 3; i += 2) a.set(x + i, top + rh - 3, C.green2)
  doorway(a, x + (w >> 1) - 1, top + rh + wh, 2, wh)
  if (size === 2) a.rect(x + w - 7, top + rh + 1, 2, 2, C.gold0)
  return finish(a)
}

/** A forest longhouse: a long thatch over a wall of upright logs. */
function forestHouse(look: Look, roof: Ramp): Art {
  const size = sizeOf(look)
  const [w, rh, wh] = (
    [
      [9, 4, 3],
      [15, 6, 4],
      [23, 8, 5],
    ] as const
  )[size]
  const a = new Art(w + 8, rh + wh + 8)
  const x = 4
  const top = 3
  const wy = top + rh
  wall(a, x + 1, wy, w - 2, wh, WALL.wood)
  // Upright logs: every third column a tone darker.
  if (size > 0) for (let i = 3; i < w - 2; i += 3) a.vline(x + i, wy + 1, wh - 1, WALL.wood[1])
  slabRoof(a, x, top, w, rh, roof, 1, size > 0)
  doorway(a, x + 3, wy + wh, size === 2 ? 3 : 2, wh - 1)
  if (size === 2) {
    // A carved post at each end of the ridge.
    a.vline(x + 1, top - 2, 2, C.gold1).vline(x + w - 2, top - 2, 2, C.gold1)
  }
  return finish(a)
}

/** A hut of branches and bark, its gable to the front. */
function barkHut(look: Look, roof: Ramp): Art {
  const size = sizeOf(look)
  const [half, wh] = (
    [
      [5, 2],
      [8, 4],
      [11, 6],
    ] as const
  )[size]
  const a = new Art(half * 2 + 8, half + wh + 10)
  const cx = (a.w >> 1) - 1
  const top = 3
  const wy = gable(a, cx, top, half, roof, WALL.wood, size === 0 ? 2 : 3, false, size === 0 ? 1 : 2)
  const inset = size === 0 ? 1 : 2
  wall(a, cx - half + 1 + inset, wy, (half - inset) * 2, wh, WALL.wood, false)
  doorway(a, cx - (size === 2 ? 1 : 0), wy + wh, size === 2 ? 3 : 2, Math.min(wh + 2, size === 0 ? 3 : 5))
  return finish(a)
}

/** The first homes: what the land gives. `land` picks the local way of building; '' the plain huts. */
export function earlyHome(look: Look): Art {
  const roof = earlyRoof(look)
  switch (look.land) {
    case 'snow':
      return look.variant % 4 === 3 ? turfHall(look, true) : igloo(look)
    case 'turf':
      return turfHall(look)
    case 'adobe':
      return adobe(look)
    case 'stilt':
      return stiltHouse(look)
    case 'longhouse':
      return forestHouse(look, roof)
    case 'round':
      return look.variant % 4 === 3 ? tent(look) : roundHouse(look, roof)
    default:
      return look.variant % 3 === 2 ? tent(look) : [barkHut, roundHouse][look.variant % 3](look, roof)
  }
}

export { tent, roundHouse, MUD }

/** The village meeting hall: a long house under one great thatch, its doors at the middle. */
export function longhouse(look: Look): Art {
  const w = look.fw * 8 + 2
  const rh = 9
  const wh = 6
  const roof = look.land === 'turf' || look.land === 'snow' ? WALL.turf : earlyRoof(look)
  const a = new Art(w + 8, rh + wh + 10)
  const x = 4
  const top = 5
  const wy = top + rh
  const L = legend(roof, WALL.wood, look.night >= 1)
  wall(a, x + 1, wy, w - 2, wh, WALL.wood)
  for (let i = 3; i < w - 2; i += 3) a.vline(x + i, wy + 1, wh - 1, WALL.wood[1])
  slabRoof(a, x, top, w, rh, roof, 2)
  // Crossed gable beams at each end of the ridge.
  a.stamp(rows('horn', 'f.f', '.f.'), x, top - 2, L).stamp(rows('horn', 'f.f', '.f.'), x + w - 3, top - 2, L)
  const cx = x + (w >> 1)
  a.stamp(rows('door', 'ffff', 'fkkf', 'fkkf', 'fkkf', 'fkkf'), cx - 2, wy + wh - 5, L)
  a.stamp(rows('win', 'ff', 'wx'), cx - 8, wy + 2, L).stamp(rows('win', 'ff', 'wx'), cx + 6, wy + 2, L)
  // The smoke hole, with a wisp-coloured rim.
  a.rect(cx - 1, top, 3, 1, C.gold0)
  return finish(a)
}
