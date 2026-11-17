import {
  Art,
  C,
  CHIMNEY,
  DOOR,
  ROOF,
  WALL,
  WINDOW,
  finish,
  gable,
  isLit,
  legend,
  rows,
  slabRoof,
  wall,
} from './kit.ts'
import type { Look, Ramp } from './kit.ts'
import { eaveOn, flatOn, floors, gableOn, plot, spread } from './house-forms.ts'
import { MUD, earlyHome, earlyRoof } from './homes-early.ts'
import { cone, dome, drum } from './shapes.ts'

/** The least modern style each home kind can take. */
export const HOME_KIND_TIER: Record<string, number> = {
  Hut: 0,
  Tent: 0,
  House: 1,
  Manor: 3,
  TownHouse: 4,
  Apartment: 6,
  Skyscraper: 7,
}

const wallW = (look: Look) => Math.max(8, look.fw * 8 - 2)
const big = (look: Look) => look.fw >= 3
const grand = (look: Look) => look.fw >= 5
/** The tribe's roof colour, or the form's own when the building has none. */
const roofOf = (look: Look, own: Ramp): Ramp => (look.roof ? ROOF[look.roof] : own)
/** Door to the left or the right of the front, by the building's variant. */
const side = (look: Look) => (look.variant & 4 ? 0 : 1)

// ── Village (bronze and iron ages) ────────────────────────────────────────────────────────────────

function thatchCottage(look: Look): Art {
  const w = wallW(look)
  const { a, g, x } = plot(look, w)
  eaveOn(a, look, x, g, {
    w,
    floors: 1,
    floorH: big(look) ? 7 : 6,
    roofH: big(look) ? 9 : 7,
    roof: earlyRoof(look),
    wall: WALL.daub,
    window: WINDOW.small,
    door: DOOR.low,
    bays: big(look) ? 3 : 2,
    doorAt: side(look),
    footing: C.grey6,
  })
  return finish(a)
}

function logHouse(look: Look): Art {
  const w = wallW(look)
  const { a, g, cx } = plot(look, w)
  gableOn(a, look, cx, g, {
    w,
    floors: 1,
    floorH: big(look) ? 7 : 6,
    roof: earlyRoof(look),
    wall: WALL.wood,
    boards: WALL.wood[1],
    window: WINDOW.small,
    door: DOOR.low,
    bays: big(look) ? 3 : 2,
    doorAt: big(look) ? 0.5 : side(look),
  })
  return finish(a)
}

function stoneCottage(look: Look): Art {
  const w = wallW(look)
  const { a, g, x } = plot(look, w)
  const mainW = big(look) ? w - 6 : w
  eaveOn(a, look, x, g, {
    w: mainW,
    floors: 1,
    floorH: big(look) ? 7 : 6,
    roofH: big(look) ? 8 : 6,
    hip: 1,
    roof: earlyRoof(look),
    wall: WALL.stone,
    window: WINDOW.small,
    door: DOOR.low,
    bays: 2,
    doorAt: 0,
  })
  if (big(look)) {
    // A lean-to store against the right wall, under its own low roof.
    wall(a, x + mainW, g - 4, 6, 4, WALL.wood)
    slabRoof(a, x + mainW, g - 7, 7, 3, earlyRoof(look), 0, false)
  }
  return finish(a)
}

// ── Classical ─────────────────────────────────────────────────────────────────────────────────────

/** A house with a porch of columns under a low tiled pediment. */
function columnHouse(look: Look): Art {
  const w = wallW(look)
  const { a, g, x, cx } = plot(look, w)
  const colH = big(look) ? 9 : 7
  const half = (w >> 1) + 1
  const roof = roofOf(look, ROOF.tile)
  // The steps, the shaded porch behind the columns, and the door in it.
  a.hline(x - 1, g - 1, w + 2, C.grey7)
  a.rect(x, g - 1 - colH, w, colH, C.tan3)
  a.rect(cx - 1, g - 7, 4, 6, C.gold0).hline(cx - 1, g - 7, 4, C.gold1)
  for (const colX of spread(x, w, big(look) ? 4 : 3, 2)) {
    a.vline(colX, g - 1 - colH, colH, C.grey9).vline(colX + 1, g - 1 - colH, colH, C.grey7)
    a.hline(colX - 1, g - 1 - colH, 4, C.grey9)
  }
  // The beam the columns carry, then the pediment.
  a.hline(x - 1, g - 2 - colH, w + 2, C.grey9).hline(x - 1, g - 3 - colH, w + 2, C.tan4)
  const gh = Math.ceil(half / 2) + 1
  gable(a, cx, g - 3 - colH - gh, half, roof, WALL.plaster, 2, true, 1)
  return finish(a)
}

/** A mud-brick town house: flat roofs to sleep on, an awning over the door, a second room on top. */
function mudBrickHouse(look: Look): Art {
  const w = wallW(look)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.tile, MUD, isLit(look))
  const top = flatOn(a, look, x, g, {
    w,
    floors: 1,
    floorH: big(look) ? 8 : 7,
    roof: [C.tan5, C.tan4, C.tan3, C.tan2],
    wall: MUD,
    window: rows('hole', 'ff', 'kk'),
    door: DOOR.open,
    bays: big(look) ? 3 : 2,
    doorAt: side(look),
  })
  // The upper room, set back to one side.
  const uw = big(look) ? 11 : 7
  const ux = side(look) ? x : x + w - uw
  wall(a, ux, top - 5, uw, 6, MUD, false)
  a.hline(ux - 1, top - 6, uw + 2, C.tan5).hline(ux - 1, top - 5, uw + 2, C.tan3)
  a.stamp(rows('hole', 'ff', 'kk'), ux + (uw >> 1) - 1, top - 3, L)
  // A striped awning on poles over the street door.
  const ax = side(look) ? x + w - 8 : x + 1
  a.stamp(rows('awning', 'RhRhRhR', 'qTqTqTq'), ax, g - (big(look) ? 7 : 6), L)
  return finish(a)
}

/** A small villa: a low tiled roof, arched openings, white walls. */
function villa(look: Look): Art {
  const w = wallW(look)
  const { a, g, x } = plot(look, w)
  eaveOn(a, look, x, g, {
    w,
    floors: big(look) ? 2 : 1,
    floorH: 7,
    roofH: 5,
    hip: 2,
    roof: roofOf(look, ROOF.tile),
    wall: WALL.plaster,
    window: WINDOW.arch,
    door: DOOR.arch,
    doorAt: 0.5,
    band: C.tan4,
    footing: C.tan3,
  })
  return finish(a)
}

// ── Medieval ──────────────────────────────────────────────────────────────────────────────────────

function timberCottage(look: Look): Art {
  const w = wallW(look)
  const { a, g, x } = plot(look, w)
  eaveOn(a, look, x, g, {
    w,
    floors: big(look) ? 2 : 1,
    floorH: 7,
    roofH: big(look) ? 8 : 7,
    roof: roofOf(look, ROOF.tile),
    wall: WALL.plaster,
    timber: true,
    window: WINDOW.framed,
    door: DOOR.plank,
    doorAt: side(look),
    chimney: CHIMNEY.stone,
    chimneyAt: side(look) ? 0.15 : 0.85,
  })
  return finish(a)
}

function timberGable(look: Look): Art {
  const w = wallW(look)
  const { a, g, cx } = plot(look, w)
  gableOn(a, look, cx, g, {
    w,
    floors: 1,
    floorH: 8,
    roof: roofOf(look, ROOF.tile),
    wall: WALL.plaster,
    timber: true,
    window: WINDOW.framed,
    door: DOOR.plank,
    doorAt: 0.5,
    attic: big(look) ? WINDOW.small : null,
    chimney: big(look) ? CHIMNEY.stone : undefined,
  })
  return finish(a)
}

function stoneHouse(look: Look): Art {
  const w = wallW(look)
  const { a, g, x } = plot(look, w)
  eaveOn(a, look, x, g, {
    w,
    floors: big(look) ? 2 : 1,
    floorH: 7,
    roofH: big(look) ? 8 : 7,
    hip: 1,
    roof: roofOf(look, ROOF.slate),
    wall: WALL.stone,
    window: WINDOW.framed,
    door: DOOR.arch,
    doorAt: side(look),
    chimney: CHIMNEY.stone,
    chimneyAt: 0.5,
    footing: C.grey5,
  })
  return finish(a)
}

/** A manor house, built to one of four plans. */
function manor(look: Look): Art {
  const w = wallW(look)
  const { a, g, x } = plot(look, w)
  const roof = roofOf(look, ROOF.tile)
  const plan = look.variant % 4
  const hall = {
    floors: 2,
    floorH: 7,
    roofH: 9,
    roof,
    wall: plan === 1 ? WALL.stone : WALL.plaster,
    timber: plan !== 1,
    window: WINDOW.framed,
    door: DOOR.double,
    chimney: CHIMNEY.stone,
  }
  if (plan === 0) {
    // A hall with a gabled wing standing forward at one end.
    eaveOn(a, look, x, g, { ...hall, w, doorAt: 0.75, chimneyAt: 0.9 })
    gableOn(a, look, x + 7, g, {
      ...hall,
      w: 14,
      floors: 2,
      door: DOOR.plank,
      doorAt: -1,
      attic: null,
      chimney: undefined,
    })
  } else if (plan === 1) {
    // A stone hall with a round stair tower under a cone.
    eaveOn(a, look, x, g, { ...hall, w: w - 9, doorAt: 0.5, chimneyAt: 0.1 })
    drum(a, x + w - 11, g - 25, 11, 25, WALL.stone)
    cone(a, x + w - 6, g - 34, 13, 9, roof, 1, false)
    a.rect(x + w - 6, g - 19, 1, 3, C.grey3).rect(x + w - 6, g - 9, 1, 3, C.grey3)
  } else if (plan === 2) {
    // Two gabled ranges joined by a lower hall.
    eaveOn(a, look, x + 12, g, {
      ...hall,
      w: w - 24,
      floors: 1,
      floorH: 8,
      roofH: 7,
      doorAt: 0.5,
      bays: 3,
      chimney: undefined,
    })
    gableOn(a, look, x + 7, g, { ...hall, w: 14, doorAt: -1, attic: WINDOW.small, chimney: undefined })
    gableOn(a, look, x + w - 9, g, { ...hall, w: 14, doorAt: -1, attic: WINDOW.small })
  } else {
    // A long hall with a gabled porch at its middle and a chimney at each end.
    eaveOn(a, look, x, g, { ...hall, w, doorAt: -1, chimneyAt: 0.05 })
    a.stamp(CHIMNEY.stone, x + w - 6, g - 14 - 9 - 3, legend(roof, WALL.stone))
    gableOn(a, look, x + (w >> 1) - 1, g, {
      ...hall,
      w: 12,
      floors: 1,
      floorH: 9,
      doorAt: 0.5,
      bays: 1,
      attic: null,
      chimney: undefined,
    })
  }
  return finish(a)
}

// ── Renaissance ───────────────────────────────────────────────────────────────────────────────────

const PASTEL: Ramp[] = [
  WALL.plaster,
  WALL.daub,
  [C.gold5, C.gold5, C.gold4, C.gold3],
  [C.grey9, C.grey8, C.grey7, C.grey6],
]
const SHUTTER: Ramp[] = [ROOF.moss, ROOF.slate, ROOF.plum, ROOF.tile]

function townhouse(look: Look): Art {
  const w = wallW(look)
  const { a, g, x } = plot(look, w)
  eaveOn(a, look, x, g, {
    w,
    floors: look.fh >= 4 ? 3 : 2,
    floorH: 7,
    roofH: 7,
    roof: roofOf(look, ROOF.tile),
    wall: PASTEL[look.variant % 4],
    alt: SHUTTER[(look.variant >> 1) % 4],
    window: WINDOW.shutter,
    door: DOOR.arch,
    doorAt: side(look),
    chimney: CHIMNEY.brick,
    band: C.tan3,
    footing: C.grey6,
  })
  return finish(a)
}

/** A brick merchant's house with a stepped gable, each step capped in pale stone. */
function steppedGable(look: Look): Art {
  const w = wallW(look)
  const { a, g, x, cx } = plot(look, w)
  const storeys = look.fh >= 4 ? 3 : 2
  const s = {
    w,
    floors: storeys,
    floorH: 7,
    roof: roofOf(look, ROOF.tile),
    wall: WALL.brick,
    window: WINDOW.sash,
    door: DOOR.arch,
    doorAt: 0.5,
    band: C.red2,
    footing: C.grey6,
  }
  const L = legend(s.roof, s.wall, isLit(look))
  const wy = g - storeys * 7
  wall(a, x, wy, w, storeys * 7, s.wall, false)
  // The gable climbs in steps two pixels high; the roof shows as a dark sliver behind each step.
  const stepsN = Math.max(2, Math.floor(w / 6))
  for (let k = 0; k < stepsN; k++) {
    const inset = (k + 1) * 2
    if (w - inset * 2 < 4) break
    const y = wy - (k + 1) * 2
    a.rect(x + inset, y, w - inset * 2, 2, s.wall[0])
    a.vline(x + w - inset - 1, y, 2, s.wall[1])
    a.set(x + inset - 1, y + 1, s.roof[2]).set(x + w - inset, y + 1, s.roof[3])
    a.hline(x + inset, y, 2, C.grey9).hline(x + w - inset - 2, y, 2, C.grey8)
  }
  a.hline(x, wy, 2, C.grey9).hline(x + w - 2, wy, 2, C.grey8)
  floors(a, x, wy, s, L)
  a.stamp(WINDOW.round, cx - 1, wy - 6, L)
  return finish(a)
}

/** A stone house under a slate mansard roof with dormer windows in it. */
function mansard(look: Look): Art {
  const w = wallW(look)
  const { a, g, x } = plot(look, w)
  const storeys = look.fh >= 4 ? 2 : 1
  const roof = roofOf(look, ROOF.slate)
  const L = legend(roof, WALL.stone, isLit(look))
  const top = flatOn(a, look, x, g, {
    w,
    floors: storeys,
    floorH: 7,
    roof: [C.grey8, C.grey7, C.grey6, C.grey5],
    wall: WALL.stone,
    window: WINDOW.sash,
    door: DOOR.panel,
    doorAt: side(look),
    band: C.grey6,
  })
  // The mansard: steep slate sides leaning in, a flat lead top.
  const mh = 7
  for (let j = 0; j < mh; j++) {
    const inset = j < 2 ? 2 - j : 0
    for (let i = x - 1 + inset; i < x + w + 1 - inset; i++)
      a.set(
        i,
        top - mh + j,
        j === 0 ? C.grey7 : i >= x + w - 2 - inset ? roof[2] : j % 3 === 0 ? roof[2] : roof[1],
      )
  }
  for (const dx of spread(x, w, big(look) ? 3 : 2, 4))
    a.stamp(rows('dormer', '.hh.', 'hwxh', 'hxxh'), dx, top - 5, L)
  a.stamp(CHIMNEY.brick, x + 1, top - mh - 3, L)
  return finish(a)
}

/** The grand house of later ages: a wide front under a low roof, a pediment on columns at its door. */
function grandVilla(look: Look): Art {
  const w = wallW(look)
  const { a, g, x, cx } = plot(look, w)
  const roof = roofOf(look, ROOF.tile)
  const L = legend(roof, WALL.plaster, isLit(look), SHUTTER[look.variant % 4])
  eaveOn(a, look, x, g, {
    w,
    floors: 2,
    floorH: 8,
    roofH: 7,
    hip: 3,
    roof,
    wall: WALL.plaster,
    alt: SHUTTER[look.variant % 4],
    window: WINDOW.shutter,
    door: DOOR.double,
    doorAt: -1,
    bays: 5,
    band: C.tan4,
    footing: C.grey7,
    chimney: CHIMNEY.brick,
    chimneyAt: 0.1,
  })
  a.stamp(CHIMNEY.brick, x + w - 7, g - 16 - 7 - 3, L)
  // The portico: a plain bay of wall at the middle, four columns in front of the door, a pediment over them.
  const pw = 16
  const px = cx - (pw >> 1) + 1
  a.rect(px - 1, g - 15, pw + 2, 14, WALL.plaster[0])
  a.stamp(DOOR.double, cx - 2, g - 8, L)
  a.rect(px, g - 10, pw, 1, C.grey9)
  for (const colX of spread(px, pw, 4, 1)) a.vline(colX, g - 9, 8, C.grey9).vline(colX + 1, g - 9, 8, C.grey7)
  gable(a, cx, g - 10 - 5, (pw >> 1) + 1, roof, WALL.plaster, 2, true, 1)
  a.hline(px - 1, g - 1, pw + 2, C.grey8)
  return finish(a)
}

// ── Industrial ────────────────────────────────────────────────────────────────────────────────────

function rowhouse(look: Look): Art {
  const w = wallW(look)
  const { a, g, x } = plot(look, w)
  const storeys = look.fh >= 4 || grand(look) ? 3 : 2
  const top = eaveOn(a, look, x, g, {
    w,
    floors: storeys,
    floorH: 7,
    roofH: 6,
    hip: 0,
    roof: roofOf(look, ROOF.slate),
    wall: look.variant & 2 ? WALL.darkBrick : WALL.brick,
    window: WINDOW.sash,
    door: DOOR.panel,
    doorAt: side(look),
    chimney: CHIMNEY.brick,
    chimneyAt: 0.1,
    footing: C.grey5,
  })
  if (big(look)) a.stamp(CHIMNEY.brick, x + w - 6, top - 3, legend(ROOF.slate, WALL.brick))
  // Stone steps up to the door.
  return finish(a)
}

/** A boarded house with a porch along its front. */
function porchHouse(look: Look): Art {
  const w = wallW(look)
  const { a, g, cx, x } = plot(look, w)
  const siding: Ramp = look.variant & 2 ? [C.blue5, C.blue5, C.blue4, C.blue3] : WALL.white
  gableOn(a, look, cx, g, {
    w,
    floors: big(look) ? 2 : 1,
    floorH: 7,
    roof: roofOf(look, ROOF.dark),
    wall: siding,
    boards: siding[2],
    window: WINDOW.sash,
    door: DOOR.panel,
    doorAt: 0.5,
    attic: big(look) ? WINDOW.round : null,
    chimney: CHIMNEY.brick,
  })
  // The porch: a lean-to roof on white posts across the ground floor.
  const roof = roofOf(look, ROOF.dark)
  a.hline(x - 1, g - 9, w + 2, roof[1]).hline(x - 1, g - 8, w + 2, roof[3])
  a.hline(x, g - 7, w, siding[3])
  for (const postX of spread(x - 1, w + 2, big(look) ? 4 : 3, 1)) a.vline(postX, g - 7, 7, C.grey9)
  a.hline(x - 1, g - 1, w + 2, C.grey7)
  return finish(a)
}

/** A brick tenement: flat roof, a water tank, a fire escape down the front. */
function tenement(look: Look): Art {
  const w = wallW(look)
  const { a, g, x } = plot(look, w)
  const storeys = Math.min(5, Math.max(2, look.fh))
  const L = legend(ROOF.dark, WALL.darkBrick, isLit(look))
  const top = flatOn(a, look, x, g, {
    w,
    floors: storeys,
    floorH: 7,
    roof: ROOF.dark,
    wall: WALL.darkBrick,
    window: WINDOW.sash,
    door: DOOR.panel,
    doorAt: 0,
    cornice: C.tan4,
    footing: C.grey4,
  })
  // The water tank on its legs.
  a.stamp(rows('tank', '.eee.', 'gggee', 'ggeef', 'ggeef', '.o.o.'), x + w - 7, top - 5, L)
  // The fire escape: a landing under each upper window of the last bay, and the ladders between.
  const fx = x + w - 7
  for (let f = 1; f < storeys; f++) {
    const y = top + 2 + f * 7 - 1
    a.hline(fx, y, 6, C.grey3)
    if (f < storeys - 1) for (let j = 1; j < 7; j += 2) a.set(fx + (f % 2 ? 5 : 0), y + j, C.grey3)
  }
  return finish(a)
}

/** A mansion of the age of steam: brick, bay windows at each end, a tower over the door. */
function mansion(look: Look): Art {
  const w = wallW(look)
  const { a, g, x, cx } = plot(look, w)
  const roof = roofOf(look, ROOF.slate)
  const base = { roof, wall: WALL.brick, window: WINDOW.sash, door: DOOR.double, footing: C.grey5, floorH: 7 }
  eaveOn(a, look, x, g, {
    ...base,
    w,
    floors: 2,
    roofH: 7,
    hip: 1,
    doorAt: -1,
    chimney: CHIMNEY.brick,
    chimneyAt: 0.02,
    bays: 5,
  })
  a.stamp(CHIMNEY.brick, x + w - 5, g - 14 - 7 - 3, legend(roof, WALL.brick))
  gableOn(a, look, x + 6, g, { ...base, w: 12, floors: 2, doorAt: -1, bays: 1, attic: null })
  gableOn(a, look, x + w - 8, g, { ...base, w: 12, floors: 2, doorAt: -1, bays: 1, attic: null })
  // The tower: one storey higher than the house, under a steep little roof with a finial.
  wall(a, cx - 4, g - 30, 10, 30, WALL.brick, false)
  const L = legend(roof, WALL.brick, isLit(look))
  a.stamp(WINDOW.sash, cx - 1, g - 28, L)
    .stamp(WINDOW.sash, cx - 1, g - 20, L)
    .stamp(DOOR.double, cx - 2, g - 7, L)
  cone(a, cx, g - 38, 12, 8, roof, 2, false)
  a.vline(cx, g - 41, 3, C.gold4)
  return finish(a)
}

// ── Modern ────────────────────────────────────────────────────────────────────────────────────────

function apartments(look: Look): Art {
  const w = wallW(look)
  const { a, g, x } = plot(look, w)
  const storeys = Math.min(7, look.fh + 1)
  const tone: Ramp = look.variant & 2 ? [C.tan5, C.tan4, C.tan3, C.tan2] : WALL.concrete
  const L = legend(ROOF.dark, tone, isLit(look))
  const top = flatOn(a, look, x, g, {
    w,
    floors: storeys,
    floorH: 5,
    roof: [C.grey7, C.grey6, C.grey5, C.grey4],
    wall: tone,
    window: rows('pane', 'wxxx', 'xxxx'),
    door: DOOR.glass,
    doorAt: 0.5,
    band: tone[2],
  })
  // A balcony rail under every other window, and the lift housing on the roof.
  for (let f = 0; f < storeys - 1; f++)
    for (const bx of spread(x, w, Math.max(1, Math.floor(w / 12)), 6))
      a.hline(bx, top + 2 + f * 5 + 4, 6, C.grey4)
  a.stamp(rows('lift', 'uuuu', 'tuuv', 'tuuv'), x + 2, top - 3, L)
  a.vline(x + w - 4, top - 5, 5, C.grey3)
  return finish(a)
}

function bungalow(look: Look): Art {
  const w = wallW(look)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.dark, WALL.white, isLit(look))
  eaveOn(a, look, x, g, {
    w,
    floors: 1,
    floorH: 7,
    roofH: 6,
    hip: 3,
    roof: roofOf(look, ROOF.dark),
    wall: WALL.white,
    window: rows('pane', 'eeeeee', 'ewxxxe', 'exxxxe'),
    door: DOOR.panel,
    bays: big(look) ? 2 : 2,
    doorAt: big(look) ? 0 : side(look),
    footing: C.grey6,
  })
  if (big(look)) {
    // The garage door at the right end, ribbed.
    a.stamp(rows('garage', 'vvvvvvv', 'tttttts', 'uuuuuuu', 'tttttts', 'uuuuuuu'), x + w - 8, g - 5, L)
  }
  // A clipped hedge by the door.
  a.rect(x - 2, g - 2, 3, 2, C.green2).hline(x - 2, g - 2, 3, C.green3)
  return finish(a)
}

/** A white house of stacked boxes with a wall of glass and a wood-clad upper room. */
function cubeHouse(look: Look): Art {
  const w = wallW(look)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.dark, WALL.white, isLit(look))
  const lh = 8
  // The ground floor: white, mostly glass.
  wall(a, x, g - lh, w, lh, WALL.white, false)
  a.hline(x - 1, g - lh - 1, w + 2, C.grey4)
  a.rect(x + 2, g - lh + 2, w - 9, lh - 3, C.blue2).hline(x + 2, g - lh + 2, w - 9, C.blue4)
  for (let i = x + 2 + 4; i < x + w - 8; i += 5) a.vline(i, g - lh + 2, lh - 3, C.grey8)
  a.stamp(DOOR.glass, x + w - 6, g - 5, L)
  // The upper box, clad in wood, hanging over one end.
  const uw = Math.round(w * 0.62)
  const ux = side(look) ? x - 1 : x + w - uw + 1
  wall(a, ux, g - lh - 8, uw, 7, WALL.wood, false)
  a.hline(ux - 1, g - lh - 9, uw + 2, C.grey4)
  for (let j = g - lh - 6; j < g - lh - 1; j += 2) a.hline(ux, j, uw - 1, C.tan1)
  a.rect(ux + 2, g - lh - 6, uw - 5, 3, isLit(look) ? C.gold5 : C.blue4).hline(
    ux + 2,
    g - lh - 4,
    uw - 5,
    isLit(look) ? C.gold4 : C.blue2,
  )
  return finish(a)
}

// ── Space age ─────────────────────────────────────────────────────────────────────────────────────

/** How tall a tower of this footprint may stand. */
const towerH = (look: Look) => Math.min(52, look.fh * 8 + 16)

function glassTower(look: Look): Art {
  const w = wallW(look) - (grand(look) ? 8 : 0)
  const h = towerH(look)
  const { a, g, x } = plot(look, w)
  const lit = isLit(look)
  a.rect(x, g - h, w, h, C.blue3)
  // Floors and mullions.
  for (let j = g - h + 3; j < g - 4; j += 4) a.hline(x, j, w, C.blue2)
  for (let i = x + 3; i < x + w - 1; i += 4) a.vline(i, g - h, h - 4, C.blue2)
  // The sky across the upper-left panes, in one clean diagonal.
  for (let j = 0; j < h - 8; j++) {
    const run = Math.max(0, Math.round((w * 0.55 * (h - 8 - j)) / (h - 8)))
    for (let i = 0; i < run; i++) if (a.get(x + i, g - h + j) === C.blue3) a.set(x + i, g - h + j, C.blue4)
  }
  if (lit)
    for (let j = g - h + 5; j < g - 6; j += 8)
      for (let i = x + 5; i < x + w - 2; i += 8) a.rect(i, j, 2, 2, C.gold5)
  a.vline(x + w - 1, g - h, h, C.blue1).vline(x + w - 2, g - h, h, C.blue2)
  // The lobby and the crown.
  a.rect(x, g - 4, w, 4, C.grey3).rect(x + (w >> 1) - 2, g - 4, 4, 4, lit ? C.gold5 : C.blue5)
  a.rect(x + 2, g - h - 2, w - 4, 2, C.grey7).hline(x + 2, g - h - 2, w - 4, C.grey9)
  a.vline(x + (w >> 1), g - h - 7, 5, C.grey6).set(x + (w >> 1), g - h - 8, C.red4)
  return finish(a)
}

/** A white tower with a garden on every other floor, spilling over the edge. */
function ecoTower(look: Look): Art {
  const w = wallW(look) - (grand(look) ? 8 : 0)
  const h = towerH(look) - 4
  const { a, g, x } = plot(look, w)
  const lit = isLit(look)
  a.rect(x, g - h, w, h, C.grey9)
    .vline(x + w - 1, g - h, h, C.grey7)
    .vline(x + w - 2, g - h, h, C.grey8)
  for (let f = 0, y = g - h; y < g - 6; f++, y += 6) {
    a.rect(x + 1, y + 1, w - 3, 3, lit ? C.gold5 : C.blue3).hline(
      x + 1,
      y + 1,
      w - 3,
      lit ? C.gold5 : C.blue4,
    )
    // The planter: a hedge along the slab, hanging over on alternate sides.
    const left = f % 2 === 0
    a.hline(x, y + 4, w, C.green2).hline(x, y + 5, w, C.grey8)
    a.rect(left ? x - 1 : x + w - 3, y + 3, 4, 2, C.green3).set(left ? x - 1 : x + w, y + 5, C.green2)
    a.set(left ? x : x + w - 1, y + 2, C.green4)
  }
  a.rect(x + (w >> 1) - 2, g - 5, 4, 5, lit ? C.gold5 : C.blue2)
  // Trees on the roof.
  for (const tx of spread(x, w, Math.max(2, Math.floor(w / 8)), 4))
    a.stamp(rows('tree', '.MM.', 'MNNn', 'NNnn', '.nn.'), tx, g - h - 4, legend(ROOF.moss, WALL.white))
  return finish(a)
}

/** A tower of living capsules plugged into a dark core, each with one round window. */
function capsuleTower(look: Look): Art {
  const w = wallW(look) - (grand(look) ? 8 : 0)
  const h = towerH(look) - 2
  const { a, g, cx } = plot(look, w)
  const L = legend(ROOF.dark, WALL.white, isLit(look))
  const coreW = Math.max(4, Math.round(w * 0.3))
  a.rect(cx - (coreW >> 1) + 1, g - h, coreW, h, C.grey4).vline(cx + (coreW >> 1), g - h, h, C.grey3)
  const pod = rows('pod', '.hhhhh.', 'hhwxhht', 'hhxxhtt', 'hhhhhtt', '.ttttu.')
  for (let y = g - 7, k = 0; y > g - h + 2; y -= 6, k++) {
    a.stamp(pod, cx - (coreW >> 1) - 6 + (k % 2), y, L)
    a.stamp(pod, cx + (coreW >> 1) + (k % 2 ? 0 : 1), y - 3, L)
  }
  a.rect(cx - 1, g - 4, 3, 4, isLit(look) ? C.gold5 : C.blue4)
  a.vline(cx, g - h - 4, 4, C.grey6).set(cx, g - h - 5, C.red4)
  return finish(a)
}

/** A porthole: a round window in a grey ring. */
const PORTHOLE = rows('porthole', '.uu.', 'uwxu', 'uxxu', '.uu.')

/** A rounded shell `w` wide and `h` tall with its top-left at (x, y): white, shaded down the right. */
function capsule(
  a: Art,
  x: number,
  y: number,
  w: number,
  h: number,
  body: number = C.grey9,
  shade: number = C.grey8,
) {
  for (let j = 0; j < h; j++) {
    const inset = j === 0 || j === h - 1 ? 2 : j === 1 || j === h - 2 ? 1 : 0
    for (let i = inset; i < w - inset; i++)
      a.set(x + i, y + j, j === h - 1 ? C.grey7 : i >= w - inset - 3 ? shade : body)
  }
}

/** A small home of the space age: one white capsule on feet, solar cells on its roof. */
function podHome(look: Look): Art {
  const w = wallW(look)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.slate, WALL.white, isLit(look))
  const h = big(look) ? 11 : 9
  a.rect(x + 2, g - 2, 2, 2, C.grey5).rect(x + w - 4, g - 2, 2, 2, C.grey5)
  capsule(a, x, g - 2 - h, w, h)
  a.hline(x + 2, g - 2 - (h >> 1) + 2, w - 5, C.blue4)
  for (const wx of spread(x, w - 6, big(look) ? 2 : 1, 4)) a.stamp(PORTHOLE, wx, g - h, L)
  a.rect(x + w - 6, g - 8, 3, 6, C.blue1).hline(x + w - 6, g - 8, 3, isLit(look) ? C.gold5 : C.blue4)
  // Solar cells laid along the top.
  a.hline(x + 3, g - 3 - h, w - 6, C.blue1).dots(x + 3, g - 3 - h, w - 6, 3, C.blue3)
  return finish(a)
}

/** A low house under a roof of living grass, glass across its front, a tree growing beside the door. */
function ecoHome(look: Look): Art {
  const w = wallW(look)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.moss, WALL.white, isLit(look))
  wall(a, x, g - 8, w, 8, WALL.white, false)
  a.rect(x + 1, g - 6, w - 8, 4, L.x).hline(x + 1, g - 6, w - 8, L.w)
  for (let i = x + 4; i < x + w - 8; i += 4) a.vline(i, g - 6, 4, C.grey9)
  a.rect(x + w - 6, g - 6, 3, 6, C.gold2).set(x + w - 4, g - 3, C.gold5)
  slabRoof(a, x - 1, g - 12, w + 2, 4, WALL.turf, 2, false)
  for (let i = x + 2; i < x + w - 2; i += 3) a.set(i, g - 13, C.green4)
  a.stamp(rows('sapling', '.MN.', 'MNNn', '.Nn.', '.I..'), x + w - 2, g - 5, L)
  return finish(a)
}

/** Two capsules, one set on the other and turned: a home that grew by a room. */
function stackHome(look: Look): Art {
  const w = wallW(look)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.slate, WALL.white, isLit(look))
  const uw = Math.round(w * 0.7)
  const ux = side(look) ? x : x + w - uw
  const tint = [C.gold4, C.blue4, C.red4, C.green3][look.variant % 4]
  const tintShade = [C.gold3, C.blue3, C.red3, C.green2][look.variant % 4]
  capsule(a, ux, g - 15, uw, 8, tint, tintShade)
  a.stamp(PORTHOLE, ux + (uw >> 1) - 2, g - 13, L)
  capsule(a, x, g - 8, w, 8)
  a.stamp(PORTHOLE, x + 2, g - 6, L)
  a.rect(x + w - 6, g - 6, 3, 6, C.blue1).hline(x + w - 6, g - 6, 3, isLit(look) ? C.gold5 : C.blue4)
  a.vline(ux + 2, g - 19, 4, C.grey6).set(ux + 2, g - 20, C.red4)
  return finish(a)
}

/** A small whitewashed house of the classical world: a flat roof, a tiled upper room, a blue door. */
function whiteHouse(look: Look): Art {
  const w = wallW(look)
  const { a, g, x } = plot(look, w)
  const roof = roofOf(look, ROOF.tile)
  wall(a, x, g - 8, w, 8, WALL.white, false)
  a.hline(x - 1, g - 9, w + 2, C.grey9).hline(x - 1, g - 8, w + 2, C.grey7)
  a.rect(x + 2, g - 6, 3, 6, C.blue2).hline(x + 2, g - 6, 3, C.blue3)
  a.rect(x + w - 5, g - 6, 2, 2, C.blue1)
  // The upper room, under four courses of tile.
  const uw = Math.max(7, w - 6)
  const ux = side(look) ? x + w - uw : x
  wall(a, ux, g - 14, uw, 5, WALL.white, false)
  a.rect(ux + (uw >> 1) - 1, g - 12, 2, 2, C.blue1)
  slabRoof(a, ux - 1, g - 17, uw + 2, 3, roof, 1, false)
  return finish(a)
}

// ── Far future ────────────────────────────────────────────────────────────────────────────────────

const SHELL: Ramp = [C.grey9, C.grey9, C.grey8, C.grey7]

/** A smooth white shell of a house with a band of light round it. */
function shellHome(look: Look): Art {
  const r = ({ 1: 4, 2: 7, 3: 10, 4: 12, 5: 16 } as Record<number, number>)[Math.min(5, look.fw)] ?? 16
  const tall = Math.min(look.fh * 3, 14)
  const a = new Art(r * 2 + 10, r + tall + 16)
  const cx = (a.w >> 1) - 1
  const g = a.h - 3
  const glow = isLit(look) ? C.gold5 : C.blue4
  dome(a, cx, g - tall - r, r, SHELL)
  a.rect(cx - r + 1, g - tall, r * 2, tall, C.grey9)
  a.rect(cx + r - 2, g - tall, 2, tall, C.grey8).vline(cx + r, g - tall, tall, C.grey7)
  // The band of light, and the door.
  a.hline(cx - r + 1, g - tall + 1, r * 2, glow).hline(cx - r + 1, g - tall + 2, r * 2 - 2, C.blue2)
  for (let y = g - tall + 5; y < g - 6; y += 5) a.hline(cx - r + 3, y, r * 2 - 6, C.grey8)
  a.rect(cx - 1, g - 5, 4, 5, C.blue1).hline(cx - 1, g - 5, 4, glow)
  a.hline(cx - r + 1, g - 1, r * 2, C.grey6)
  a.vline(cx + (r >> 1), g - tall - r - 3, 4, C.grey6).set(cx + (r >> 1), g - tall - r - 4, glow)
  return finish(a)
}

/** A glass dome over a garden: the frame, a tree inside, and the airlock. */
function domeHabitat(look: Look): Art {
  const r = ({ 1: 4, 2: 8, 3: 12, 4: 14, 5: 20 } as Record<number, number>)[Math.min(5, look.fw)] ?? 20
  const a = new Art(r * 2 + 10, r + 12)
  const cx = (a.w >> 1) - 1
  const g = a.h - 3
  const top = g - r - 2
  dome(a, cx, top, r, [C.grey9, C.blue5, C.blue4, C.blue3])
  // The garden seen through the glass: grass along the floor and a tree.
  for (let j = Math.round(r * 0.72); j < r; j++)
    for (let i = -r; i <= r; i++)
      if (a.get(cx + i, top + j)) a.set(cx + i, top + j, j === Math.round(r * 0.72) ? C.green3 : C.green2)
  if (r >= 8) {
    const L = legend(ROOF.moss, WALL.white)
    a.stamp(rows('tree', '.MNN.', 'MNNNn', 'NNNnn', '.NnnI', '..I..', '..I..'), cx - 2, top + r - 8, L)
  }
  // The frame: a rib over the top and the ring at the base.
  if (r >= 8)
    for (let j = 0; j < r; j++)
      if (a.get(cx, top + j) !== C.green2 && a.get(cx, top + j) !== C.green3 && j < r * 0.4)
        a.set(cx, top + j, C.grey9)
  a.rect(cx - r + 1, g - 2, r * 2, 2, C.grey7).hline(cx - r + 1, g - 2, r * 2, C.grey9)
  a.rect(cx + r - 5, g - 4, 4, 4, C.grey6).rect(cx + r - 4, g - 3, 2, 3, isLit(look) ? C.gold5 : C.blue1)
  return finish(a)
}

/** A home that floats: a saucer with a ring of lights, its lift beam under it. */
function hoverHome(look: Look): Art {
  const w = Math.max(10, wallW(look))
  const a = new Art(w + 10, Math.round(w * 0.45) + 18)
  const cx = (a.w >> 1) - 1
  const g = a.h - 3
  const half = w >> 1
  const glow = isLit(look) ? C.gold5 : C.blue4
  const y = g - 8 - Math.round(w * 0.3)
  // The cabin, a low dome of glass, over the hull.
  const cr = Math.max(2, Math.min(10, Math.round(half * 0.5)))
  const cabin = [2, 3, 4, 5, 6, 7, 8, 9, 10].includes(cr) ? cr : 4
  dome(a, cx, y - cabin + 1, cabin, [C.grey9, C.blue5, C.blue4, C.blue3])
  const hullH = Math.max(3, Math.round(w * 0.2))
  for (let j = 0; j < hullH; j++) {
    const inset = j === 0 || j === hullH - 1 ? 2 : j === 1 || j === hullH - 2 ? 1 : 0
    const row = y + 1 + j
    for (let i = -half + 1 + inset; i <= half - inset; i++)
      a.set(cx + i, row, j === 0 ? C.grey9 : j >= hullH - 1 ? C.grey6 : i > half * 0.5 ? C.grey7 : C.grey8)
  }
  for (let i = -half + 3; i <= half - 2; i += 3) a.set(cx + i, y + 1 + (hullH >> 1), glow)
  // Landing legs: three struts splayed out from under the hull, each on a pad.
  const legTop = y + 1 + hullH
  const reach = Math.max(2, half >> 1)
  for (let j = 0; legTop + j < g - 1; j++) {
    a.set(cx - reach - (j >> 1), legTop + j, C.grey5).set(cx + 1 + reach + (j >> 1), legTop + j, C.grey5)
    if (j % 2 === 0) a.set(cx, legTop + j, C.grey6)
  }
  const spreadOut = (g - 1 - legTop) >> 1
  a.hline(cx - reach - spreadOut - 1, g - 1, 3, C.grey4)
    .hline(cx + reach + spreadOut, g - 1, 3, C.grey4)
    .hline(cx - 1, g - 1, 3, C.grey4)
  return finish(a)
}

// ── Which home ────────────────────────────────────────────────────────────────────────────────────

/** Lands whose climate keeps the old way of building into the village age. */
const LAND_BOUND = new Set(['adobe', 'snow', 'stilt'])

/** A home in its tribe's style: a kind never drops below its own tier, and each era has several forms. */
export function home(look: Look): Art {
  const tier = Math.max(HOME_KIND_TIER[look.kind] ?? 0, look.tier)
  const form = look.variant
  if (tier === 0) return earlyHome(look)
  if (tier === 1 && look.land && (LAND_BOUND.has(look.land) || form % 2 === 0)) return earlyHome(look)
  switch (tier) {
    case 1:
      return [thatchCottage, logHouse, stoneCottage][form % 3](look)
    case 2:
      return [big(look) ? columnHouse : whiteHouse, mudBrickHouse, villa][form % 3](look)
    case 3:
      return grand(look) ? manor(look) : [timberCottage, timberGable, stoneHouse][form % 3](look)
    case 4:
      return grand(look) ? grandVilla(look) : [townhouse, steppedGable, mansard][form % 3](look)
    case 5:
      return grand(look) && look.kind === 'Manor'
        ? mansion(look)
        : [rowhouse, porchHouse, tenement][form % 3](look)
    case 6:
      return look.kind === 'Apartment' || look.kind === 'Skyscraper'
        ? apartments(look)
        : [apartments, grand(look) ? cubeHouse : bungalow, cubeHouse][form % 3](look)
    case 7:
      // A small plot stays a small home; the towers are for the kinds that were always tall.
      return look.kind === 'Hut' || look.kind === 'House'
        ? [podHome, ecoHome, stackHome][form % 3](look)
        : [glassTower, ecoTower, capsuleTower][form % 3](look)
    default:
      return [shellHome, domeHabitat, shellHome, hoverHome][form % 4](look)
  }
}
