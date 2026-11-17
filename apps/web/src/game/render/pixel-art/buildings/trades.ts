import {
  Art,
  C,
  CHIMNEY,
  DOOR,
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
import type { Legend, Look, Ramp } from './kit.ts'
import { plot, spread } from './house-forms.ts'
import { dome } from './shapes.ts'

/**
 * What each trade hangs out: a picture five pixels wide and four tall, painted on the signboard over the
 * shop. A player reads the street by its signs, so no two trades share one.
 */
export const SIGNS: Record<string, readonly string[]> = {
  Bakery: rows('bread', '.ggg.', 'gYYYg', 'gYgYg', '.ggg.'),
  Butcher: rows('meat', '.rr.h', 'rRRrh', 'rRRr.', '.rr..'),
  Fishmonger: rows('fish', '.....', 'L.LL.', 'LLLoL', 'L.LL.'),
  Cheesemonger: rows('cheese', '...YY', '.YYYy', 'YYoYy', 'yyyyy'),
  Tailor: rows('scissors', 'u...u', '.u.u.', '..u..', '.P.P.'),
  Cobbler: rows('boot', '.ee..', '.ee..', '.eeee', '.ffff'),
  ClothingShop: rows('shirt', 'PP.PP', 'PPPPP', '.PPP.', '.PPP.'),
  Jeweler: rows('gem', '.lll.', 'lihll', '.lLl.', '..L..'),
  Apothecary: rows('flask', '..h..', '..h..', '.NNN.', '.nnn.'),
  Herbalist: rows('leaf', '...N.', '.NNN.', 'NNn..', 'e....'),
  Barbershop: rows('pole', 'RhLRh', 'hLRhL', 'LRhLR', 'RhLRh'),
  Scribe: rows('quill', '...hh', '..hs.', '.hs..', 'o....'),
  BookStore: rows('book', 'hhohh', 'hhohh', 'hhohh', 'LLLLL'),
  Cafe: rows('cup', 'hhhh.', 'hhhhh', 'hhhh.', '.hh..'),
  Restaurant: rows('fork', 'o.o.s', 'ooo.s', '.o..s', '.o..s'),
  Tavern: rows('mug', 'hhhh.', 'YYYYo', 'YYYYo', 'YYYY.'),
  Brewery: rows('barrel', '.eee.', 'ogggo', 'eggge', '.ooo.'),
  Inn: rows('bed', 'e....', 'ehRRR', 'eeeee', 'e...e'),
  Hotel: rows('h', 'L...L', 'LLLLL', 'L...L', 'L...L'),
  PostOffice: rows('letter', 'hhhhh', 'huhuh', 'hhuhh', 'hhhhh'),
  Pharmacy: rows('cross', '..N..', '.NNN.', '..N..', '.....'),
  Clinic: rows('cross', '..R..', '.RRR.', '..R..', '.....'),
  Bathhouse: rows('waves', '.l.l.', 'l.l.l', 'LLLLL', 'jjjjj'),
  Spa: rows('lotus', '..P..', 'P.P.P', 'PPPPP', '.nnn.'),
  Kennel: rows('bone', '.....', 'h...h', 'hhhhh', 'h...h'),
  Goldsmith: rows('ring', '.YYY.', 'Y...Y', 'Y...Y', '.YYY.'),
  Smithy: rows('horseshoe', 'u...u', 'u...u', 'u...u', '.uuu.'),
  ArtGallery: rows('frame', 'eeeee', 'eRlNe', 'eYPle', 'eeeee'),
  MusicHall: rows('note', '..ooo', '..o.o', 'oo.oo', 'oo.oo'),
  Theatre: rows('curtain', 'RRRRR', 'Rr.rR', 'R...R', 'R...R'),
  MallShop: rows('bag', '.o.o.', 'RRRRR', 'RRRRR', 'RRRRR'),
  Supermarket: rows('trolley', 'o....', '.uuuu', '.uuu.', '.o.o.'),
  GuildHall: rows('shield', 'LLYLL', 'LLYLL', '.LYL.', '..Y..'),
  Workshop: rows('hammer', '.uuu.', '.uuu.', '..e..', '..e..'),
  Bank: rows('coin', '.YYY.', 'YyYyY', 'YyYyY', '.YYY.'),
}

/** The signboard: a wooden frame round a pale board with the trade's picture, its top-left at (x, y). */
export function signboard(a: Art, kind: string, x: number, y: number, L: Legend) {
  const sign = SIGNS[kind]
  if (!sign) return
  a.rect(x, y, 7, 6, C.gold1).rect(x + 1, y + 1, 5, 4, C.tan5)
  a.stamp(sign, x + 1, y + 1, L)
}

type Body = 'eave' | 'gable' | 'stall' | 'tall' | 'modern'

interface ShopSpec {
  body: Body
  wall: Ramp
  roof: Ramp
  /** The two stripes of the awning. */
  awning: readonly [number, number]
  /** What stands outside: the trade made visible. Drawn on the ground by the wall. */
  goods?: readonly string[]
  /** For a stall: the colours of what lies on its counter. */
  counter?: readonly number[]
  timber?: boolean
  chimney?: readonly string[]
}

const G = {
  basket: rows('basket', '.YgY.', 'gYYYg', 'eeeee', '.eee.'),
  hams: rows('hams', 'o.o.o', 'r.R.r', 'R.r.R', '..R..'),
  fishRack: rows('fishrack', 'eeeee', 'L.l.L', 'L.l.L', 'e...e'),
  cheeses: rows('cheeses', '.YYY.', 'YYyYY', 'yyyyy', 'YYyYY'),
  dummy: rows('dummy', '.T.', 'PPP', 'PPP', '.P.', '.e.'),
  bigBoot: rows('bigboot', 'ee..', 'ee..', 'eee.', 'eeee', 'ffff'),
  rack: rows('rack', 'ooooo', 'P.L.R', 'P.L.R', 'P.L.R', 'o...o'),
  pots: rows('pots', 'N.M.N', 'NnMnN', 'e.e.e'),
  pole: rows('pole', 'h', 'R', 'h', 'L', 'h', 'R', 'o'),
  desk: rows('desk', 'hh.o', 'hT.o', 'eeee', 'e..e'),
  books: rows('books', 'LLL.', 'RRRR', '.NNN', 'YYYY'),
  parasol: rows('parasol', '.RhR.', 'RhRhR', '..e..', '.hhh.', '.e.e.'),
  tables: rows('tables', 'hhh.hhh', 'heh.heh', '.e...e.'),
  postbox: rows('postbox', 'RRR', 'RoR', 'RRR', 'RRR', 'qqq'),
  ingots: rows('ingots', '.YY.', 'YyYy', 'yyyy'),
  palm: rows('palm', 'M.M.M', '.MNM.', '..e..', '..e..', '.PPP.'),
  bottles: rows('bottles', 'N.R.l', 'N.R.l', 'eeeee'),
  gemCase: rows('gemcase', 'sssss', 'slyPs', 'sssss', 't...t'),
}

const SHOPS: Record<string, ShopSpec> = {
  Bakery: {
    body: 'gable',
    wall: WALL.plaster,
    roof: ROOF.tile,
    timber: true,
    awning: [C.gold4, C.grey9],
    goods: G.basket,
    chimney: CHIMNEY.brick,
  },
  Butcher: {
    body: 'stall',
    wall: WALL.brick,
    roof: ROOF.wood,
    awning: [C.red4, C.grey9],
    goods: G.hams,
    counter: [C.red4, C.red3, C.plum5, C.red4],
  },
  Fishmonger: {
    body: 'stall',
    wall: WALL.wood,
    roof: ROOF.slate,
    awning: [C.blue3, C.grey9],
    goods: G.fishRack,
    counter: [C.blue4, C.grey8, C.blue3, C.grey8],
  },
  Cheesemonger: {
    body: 'stall',
    wall: WALL.plaster,
    roof: ROOF.straw,
    awning: [C.gold5, C.gold3],
    goods: G.cheeses,
    counter: [C.gold5, C.gold4, C.tan5, C.gold5],
  },
  Tailor: {
    body: 'tall',
    wall: WALL.plaster,
    roof: ROOF.plum,
    timber: true,
    awning: [C.plum3, C.grey9],
    goods: G.dummy,
  },
  Cobbler: { body: 'gable', wall: WALL.wood, roof: ROOF.wood, awning: [C.gold2, C.tan5], goods: G.bigBoot },
  ClothingShop: { body: 'eave', wall: WALL.daub, roof: ROOF.plum, awning: [C.plum4, C.grey9], goods: G.rack },
  Jeweler: { body: 'tall', wall: WALL.stone, roof: ROOF.slate, awning: [C.blue4, C.grey9], goods: G.gemCase },
  Apothecary: {
    body: 'tall',
    wall: WALL.plaster,
    roof: ROOF.moss,
    timber: true,
    awning: [C.green3, C.grey9],
    goods: G.bottles,
  },
  Herbalist: {
    body: 'stall',
    wall: WALL.wood,
    roof: ROOF.moss,
    awning: [C.green2, C.green4],
    goods: G.pots,
    counter: [C.green3, C.green4, C.plum4, C.green2],
  },
  Barbershop: { body: 'eave', wall: WALL.white, roof: ROOF.slate, awning: [C.red4, C.blue3], goods: G.pole },
  Scribe: {
    body: 'tall',
    wall: WALL.plaster,
    roof: ROOF.slate,
    timber: true,
    awning: [C.tan3, C.tan5],
    goods: G.desk,
  },
  BookStore: { body: 'gable', wall: WALL.brick, roof: ROOF.slate, awning: [C.blue2, C.tan5], goods: G.books },
  Cafe: { body: 'eave', wall: WALL.daub, roof: ROOF.wood, awning: [C.gold2, C.grey9], goods: G.parasol },
  Restaurant: { body: 'eave', wall: WALL.brick, roof: ROOF.dark, awning: [C.red3, C.grey9], goods: G.tables },
  PostOffice: {
    body: 'gable',
    wall: WALL.brick,
    roof: ROOF.slate,
    awning: [C.blue3, C.gold5],
    goods: G.postbox,
  },
  Goldsmith: {
    body: 'tall',
    wall: WALL.stone,
    roof: ROOF.straw,
    awning: [C.gold4, C.gold2],
    goods: G.ingots,
  },
  Spa: { body: 'eave', wall: WALL.white, roof: ROOF.plum, awning: [C.plum4, C.plum5], goods: G.palm },
  Pharmacy: { body: 'modern', wall: WALL.white, roof: ROOF.stone, awning: [C.green3, C.grey9] },
  Clinic: { body: 'modern', wall: WALL.white, roof: ROOF.stone, awning: [C.red4, C.grey9] },
  Supermarket: { body: 'modern', wall: WALL.concrete, roof: ROOF.stone, awning: [C.red4, C.red4] },
  MallShop: { body: 'modern', wall: WALL.concrete, roof: ROOF.stone, awning: [C.blue3, C.blue3] },
}

/** A striped awning `w` wide with its top-left at (x, y): two rows of stripes over a line of shadow. */
function awning(a: Art, x: number, y: number, w: number, stripes: readonly [number, number], shadow: number) {
  for (let i = 0; i < w; i++) {
    const c = (i >> 1) % 2 === 0 ? stripes[0] : stripes[1]
    a.set(x + i, y, c).set(x + i, y + 1, c)
  }
  a.hline(x, y + 2, w, shadow)
}

/** A shop window `w` wide on row `g`, with its frame and sill. */
function shopWindow(a: Art, x: number, g: number, w: number, L: Legend, sill: number) {
  a.rect(x, g - 6, w, 5, C.gold1)
    .rect(x + 1, g - 5, w - 2, 3, L.x)
    .hline(x + 1, g - 5, w - 2, L.w)
  a.hline(x, g - 2, w, sill)
}

/**
 * A shop. Trades are built to different plans (a gabled front, an open stall, a tall narrow house, a long
 * front under the eaves, a modern box), and each puts its trade outside where it can be seen: hams on hooks,
 * a rack of fish, a dummy in a dress. The signboard repeats it in a picture.
 */
export function shop(look: Look): Art {
  const s = SHOPS[look.kind] ?? SHOPS.Bakery
  const w = Math.max(12, look.fw * 8 - 2)
  const { a, g, x, cx } = plot(look, w)
  const L = legend(s.roof, s.wall, isLit(look))
  const doorLeft = (look.variant & 1) === 0
  const goodsAt = (gw: number) => (doorLeft ? x + w - gw + 1 : x - 1)

  if (s.body === 'stall') {
    // An open front: a counter of goods under a deep awning, the shop dark behind it.
    wall(a, x, g - 10, w, 10, s.wall, false)
    a.rect(x + 1, g - 8, w - 2, 5, C.gold0)
    a.rect(x + 1, g - 3, w - 2, 3, C.gold2).hline(x + 1, g - 3, w - 2, C.gold3)
    const counter = s.counter ?? [C.gold5]
    for (let i = 0; i < w - 4; i++)
      if (i % 3 !== 2) a.set(x + 2 + i, g - 4, counter[Math.floor(i / 3) % counter.length])
    if (s.goods) a.stamp(s.goods, cx - (s.goods[0].length >> 1) + 1, g - 9, L)
    awning(a, x - 1, g - 12, w + 2, s.awning, C.gold0)
    slabRoof(a, x - 1, g - 16, w + 2, 4, s.roof, 1, false)
    signboard(a, look.kind, cx - 2, g - 20, L)
    return finish(a)
  }

  if (s.body === 'tall') {
    // A narrow house of two floors, the upper one jettied out over the street, the sign hung from a bracket.
    const tw = w - 4
    const tx = doorLeft ? x : x + 4
    const half = (tw >> 1) + 2
    wall(a, tx, g - 8, tw, 8, s.wall, false)
    wall(a, tx - 1, g - 15, tw + 2, 7, s.wall, false)
    a.hline(tx - 1, g - 8, tw + 2, s.timber ? C.gold1 : s.wall[3])
    if (s.timber)
      a.vline(tx - 1, g - 15, 7, C.gold1)
        .vline(tx + tw, g - 15, 7, C.gold1)
        .vline(tx, g - 7, 7, C.gold1)
        .vline(tx + tw - 1, g - 7, 7, C.gold1)
    const tcx = tx + (tw >> 1) - 1
    gable(a, tcx, g - 15 - half - 1, half, s.roof, s.wall, 2)
    a.stamp(WINDOW.framed, tcx - 1, g - 14, L)
    a.stamp(DOOR.low, tx + 1, g - 4, L)
    a.rect(tx + 5, g - 6, tw - 6, 4, C.gold1)
      .rect(tx + 6, g - 5, tw - 8, 2, L.x)
      .hline(tx + 6, g - 5, tw - 8, L.w)
    // The bracket and the hanging sign, out over the street.
    const sx = doorLeft ? tx + tw + 1 : tx - 8
    a.hline(doorLeft ? tx + tw : tx - 7, g - 16, 7, C.gold0)
    signboard(a, look.kind, sx - (doorLeft ? 1 : 0), g - 15, L)
    if (s.goods) a.stamp(s.goods, doorLeft ? tx + tw + 1 : tx - s.goods[0].length - 1, g - s.goods.length, L)
    return finish(a)
  }

  if (s.body === 'gable') {
    // A gabled front with the window under the awning and the sign in the gable.
    const half = (w >> 1) + 1
    wall(a, x, g - 9, w, 9, s.wall, false)
    if (s.timber) a.vline(x, g - 9, 9, C.gold1).vline(x + w - 1, g - 9, 9, C.gold1)
    gable(a, cx, g - 9 - half - 2, half, s.roof, s.wall, 3)
    if (s.timber) a.hline(x, g - 9, w, C.gold1)
    signboard(a, look.kind, cx - 2, g - 17, L)
    a.stamp(DOOR.plank, doorLeft ? x + 1 : x + w - 5, g - 6, L)
    shopWindow(a, doorLeft ? x + 6 : x + 1, g, w - 7, L, s.wall[2])
    awning(a, doorLeft ? x + 5 : x, g - 9, w - 5, s.awning, s.wall[3])
    if (s.chimney) a.stamp(s.chimney, cx + (half >> 1), g - 9 - half - 1, L)
    if (s.goods) a.stamp(s.goods, goodsAt(s.goods[0].length), g - s.goods.length, L)
    return finish(a)
  }

  if (s.body === 'modern') {
    // A flat-roofed box: glass along the front and the sign on a fascia in the shop's colour.
    const upper = look.kind === 'MallShop' ? 1 : 0
    const wh = 9 + upper * 7
    wall(a, x, g - wh, w, wh, s.wall, false)
    if (upper)
      for (const wx of spread(x, w, 3, 6)) a.rect(wx, g - wh + 4, 6, 3, L.x).hline(wx, g - wh + 4, 6, L.w)
    a.stamp(DOOR.glass, doorLeft ? x + 1 : x + w - 5, g - 5, L)
    a.rect(doorLeft ? x + 6 : x + 1, g - 6, w - 7, 5, L.x).hline(doorLeft ? x + 6 : x + 1, g - 6, w - 7, L.w)
    for (let i = (doorLeft ? x + 6 : x + 1) + 4; i < (doorLeft ? x + w - 1 : x + w - 6); i += 5)
      a.vline(i, g - 6, 5, C.grey9)
    flatRoof(a, x - 1, g - wh - 2, w + 2, 2, s.roof)
    a.rect(x - 1, g - wh, w + 2, 3, s.awning[0]).hline(x - 1, g - wh + 2, w + 2, s.wall[3])
    signboard(a, look.kind, cx - 2, g - wh - 5, L)
    // The supermarket keeps its trolleys in a rack by the door.
    if (look.kind === 'Supermarket')
      a.stamp(rows('trolleys', 'u.u.u', 'uuuuu', 'o.o.o'), doorLeft ? x + w : x - 5, g - 3, L)
    return finish(a)
  }

  // A long front under the eaves, with rooms above on a deeper plot.
  const upper = look.fh >= 3 ? 1 : 0
  const wh = 9 + upper * 7
  wall(a, x, g - wh, w, wh, s.wall)
  for (let f = 0; f < upper; f++)
    for (const wx of spread(x, w, w >= 20 ? 3 : 2, 4)) a.stamp(WINDOW.framed, wx, g - wh + 2, L)
  a.stamp(DOOR.plank, doorLeft ? x + 1 : x + w - 5, g - 6, L)
  shopWindow(a, doorLeft ? x + 6 : x + 1, g, w - 7, L, s.wall[2])
  awning(a, x - 1, g - 9, w + 2, s.awning, s.wall[3])
  const rh = w >= 20 ? 7 : 6
  slabRoof(a, x - 1, g - wh - rh, w + 2, rh, s.roof, 2)
  signboard(a, look.kind, cx - 2, g - wh - rh - 3, L)
  if (s.goods) a.stamp(s.goods, goodsAt(s.goods[0].length), g - s.goods.length, L)
  return finish(a)
}

/** An inn, tavern or brewery: two timbered floors, a lantern at the door, and its trade at the side. */
export function inn(look: Look): Art {
  const w = Math.max(14, look.fw * 8 - 2)
  const { a, g, x } = plot(look, w)
  const roof = look.kind === 'Tavern' ? ROOF.wood : look.kind === 'Brewery' ? ROOF.slate : ROOF.tile
  const L = legend(roof, WALL.plaster, isLit(look))
  const mainW = look.kind === 'Brewery' ? w - 6 : w
  const wy = g - 15
  wall(a, x, wy, mainW, 15, WALL.plaster)
  a.vline(x, wy, 15, C.gold1)
    .vline(x + mainW - 1, wy, 15, C.gold1)
    .hline(x, wy + 7, mainW, C.gold1)
  for (const wx of spread(x, mainW, mainW >= 20 ? 3 : 2, 4)) a.stamp(WINDOW.framed, wx, wy + 2, L)
  a.stamp(DOOR.arch, x + 2, g - 6, L)
  a.stamp(WINDOW.shop, x + 8, g - 6, L)
  if (mainW >= 20) a.stamp(WINDOW.framed, x + mainW - 6, g - 6, L)
  slabRoof(a, x - 1, wy - 8, mainW + 2, 8, roof, 2)
  a.stamp(CHIMNEY.stone, x + 2, wy - 11, L)
  signboard(a, look.kind, x + (mainW >> 1) - 3, wy - 11, L)
  // A lantern on a bracket by the door.
  a.hline(x - 2, g - 9, 3, C.gold1).rect(x - 2, g - 8, 2, 2, isLit(look) ? C.gold5 : C.gold4)
  if (look.kind === 'Tavern') {
    // Barrels stacked by the wall.
    a.stamp(rows('barrels', '.ee.', 'eggf', 'oooo', 'eggf'), x + mainW - 2, g - 4, L)
  } else if (look.kind === 'Brewery') {
    // The copper: a round vat under its own little roof, with a flue.
    const vx = x + mainW
    a.rect(vx, g - 9, 6, 9, C.gold3)
      .vline(vx, g - 9, 9, C.gold5)
      .rect(vx + 4, g - 9, 2, 9, C.gold2)
    a.hline(vx, g - 6, 6, C.gold1).hline(vx, g - 3, 6, C.gold1)
    a.rect(vx - 1, g - 11, 8, 2, roof[2]).hline(vx - 1, g - 11, 8, roof[0])
    a.vline(vx + 3, g - 16, 5, C.grey5).vline(vx + 2, g - 16, 5, C.grey7)
  }
  return finish(a)
}

/** A bathhouse: a stone hall under a dome, steam rising from its roof vents, water at the door. */
export function bathhouse(look: Look): Art {
  const w = Math.max(14, look.fw * 8 - 2)
  const { a, g, x, cx } = plot(look, w)
  const L = legend(ROOF.copper, WALL.stone, isLit(look))
  wall(a, x, g - 10, w, 10, WALL.stone, false)
  a.hline(x - 1, g - 11, w + 2, C.grey9).hline(x - 1, g - 10, w + 2, C.grey6)
  dome(a, cx, g - 11 - 6, 6, ROOF.copper)
  for (const wx of spread(x, w, 2, 4)) a.stamp(WINDOW.arch, wx, g - 8, L)
  a.stamp(DOOR.arch, cx - 1, g - 6, L)
  // Steam: three pale puffs climbing from the dome.
  a.rect(cx + 3, g - 20, 2, 1, C.grey9)
    .rect(cx + 5, g - 22, 2, 1, C.grey8)
    .rect(cx + 3, g - 24, 1, 1, C.grey8)
  signboard(a, 'Bathhouse', x + 1, g - 18, L)
  a.hline(x, g - 1, w, C.blue3)
  return finish(a)
}

/** A hotel: three floors of windows, a canopy over the door, its letter on the roof. */
export function hotel(look: Look): Art {
  const w = Math.max(22, look.fw * 8 - 2)
  const { a, g, x, cx } = plot(look, w)
  const L = legend(ROOF.dark, WALL.daub, isLit(look), ROOF.tile)
  const floorsN = 3
  const wy = g - floorsN * 7
  wall(a, x, wy, w, floorsN * 7, WALL.daub, false)
  for (let f = 0; f < floorsN; f++) {
    if (f) a.hline(x, wy + f * 7, w, C.tan3)
    for (const wx of spread(x, w, 4, 4))
      if (f < floorsN - 1 || Math.abs(wx + 2 - cx) > 5) a.stamp(WINDOW.sash, wx, wy + f * 7 + 1, L)
  }
  a.stamp(DOOR.double, cx - 2, g - 7, L)
  // The canopy over the entrance, red with a gold edge.
  a.rect(cx - 5, g - 9, 12, 2, C.red4).hline(cx - 5, g - 7, 12, C.gold4)
  flatRoof(a, x - 1, wy - 2, w + 2, 2, ROOF.dark)
  a.hline(x - 1, wy, w + 2, C.tan5)
  signboard(a, 'Hotel', cx - 2, wy - 7, L)
  return finish(a)
}

/** A hall with a front of its own: the guildhall, the gallery and the music hall. */
export function hall(look: Look): Art {
  const w = Math.max(22, look.fw * 8 - 2)
  const { a, g, x, cx } = plot(look, w)
  const kind = look.kind
  const style: { wall: Ramp; roof: Ramp } =
    kind === 'ArtGallery'
      ? { wall: WALL.white, roof: ROOF.stone }
      : kind === 'MusicHall'
        ? { wall: WALL.daub, roof: ROOF.plum }
        : { wall: WALL.plaster, roof: ROOF.slate }
  const L = legend(style.roof, style.wall, isLit(look))
  const wh = 14
  const wy = g - wh
  wall(a, x, wy, w, wh, style.wall)
  if (kind === 'GuildHall') {
    // Timbered, with a banner of the guild's colours each side of the door.
    a.vline(x, wy, wh, C.gold1)
      .vline(x + w - 1, wy, wh, C.gold1)
      .hline(x, wy + 6, w, C.gold1)
    for (const wx of spread(x, w, 3, 4)) a.stamp(WINDOW.framed, wx, wy + 1, L)
    a.stamp(rows('banner', 'LYL', 'LYL', 'LYL', 'L.L'), cx - 6, g - 7, L).stamp(
      rows('banner', 'LYL', 'LYL', 'LYL', 'L.L'),
      cx + 5,
      g - 7,
      L,
    )
  } else if (kind === 'ArtGallery') {
    // Tall bright windows with a picture hung in each.
    const pics = [C.red4, C.blue3, C.gold4, C.green3]
    spread(x, w, 3, 5).forEach((wx, i) => {
      if (Math.abs(wx + 2 - cx) < 4) return
      a.rect(wx, wy + 3, 5, 9, C.grey8)
        .rect(wx + 1, wy + 5, 3, 4, pics[i % 4])
        .hline(wx + 1, wy + 5, 3, pics[(i + 1) % 4])
    })
  } else {
    // A row of arched windows under a cornice.
    for (const wx of spread(x, w, 4, 4)) if (Math.abs(wx + 2 - cx) > 4) a.stamp(WINDOW.arch, wx, wy + 3, L)
    a.hline(x, wy + 1, w, C.gold4)
  }
  a.stamp(DOOR.double, cx - 2, g - 7, L)
  slabRoof(a, x - 1, wy - 7, w + 2, 7, style.roof, kind === 'ArtGallery' ? 0 : 3)
  signboard(a, kind, cx - 2, wy - 10, L)
  return finish(a)
}

/** A theatre: a tall front with a lit marquee over its doors and the masks above. */
export function theatre(look: Look): Art {
  const w = Math.max(30, look.fw * 8 - 2)
  const { a, g, x, cx } = plot(look, w)
  const L = legend(ROOF.plum, WALL.daub, isLit(look))
  const wh = 20
  const wy = g - wh
  wall(a, x, wy, w, wh, WALL.daub, false)
  // Pilasters dividing the front, and a stepped parapet.
  for (const px of spread(x, w, 4, 2)) a.rect(px, wy, 2, wh, C.tan5).vline(px + 1, wy, wh, C.tan3)
  a.rect(x - 1, wy - 2, w + 2, 2, C.tan5).hline(x - 1, wy - 1, w + 2, C.tan3)
  a.rect(cx - 7, wy - 6, 16, 4, C.tan5)
    .hline(cx - 7, wy - 6, 16, C.grey9)
    .vline(cx + 8, wy - 5, 3, C.tan3)
  signboard(a, 'Theatre', cx - 2, wy - 9, L)
  // The marquee: a red canopy edged with bulbs.
  a.rect(cx - 9, g - 11, 20, 3, C.red3).hline(cx - 9, g - 11, 20, C.red4)
  for (let i = 0; i < 20; i += 2) a.set(cx - 9 + i, g - 8, isLit(look) ? C.gold5 : C.gold4)
  a.stamp(DOOR.double, cx - 6, g - 7, L).stamp(DOOR.double, cx + 2, g - 7, L)
  // Posters each side.
  a.rect(x + 2, g - 9, 4, 6, C.plum2).rect(x + 3, g - 8, 2, 3, C.gold5)
  a.rect(x + w - 6, g - 9, 4, 6, C.blue2).rect(x + w - 5, g - 8, 2, 3, C.red4)
  return finish(a)
}

/** A kennel: a dog house with a gabled roof and an arched door, a bowl beside it, a fence round the yard. */
export function kennel(look: Look): Art {
  const w = Math.max(12, look.fw * 8 - 4)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.tile, WALL.wood, isLit(look))
  const hw = 10
  const hx = x + 1
  const hc = hx + (hw >> 1) - 1
  wall(a, hx, g - 6, hw, 6, WALL.wood, false)
  for (let j = g - 4; j < g - 1; j += 2) a.hline(hx, j, hw - 1, C.tan1)
  gable(a, hc, g - 6 - 7, (hw >> 1) + 1, ROOF.tile, WALL.wood, 2)
  a.stamp(rows('dogdoor', '.kk.', 'kkkk', 'kkkk', 'kkkk'), hc - 1, g - 4, L)
  // The dog's bowl, and the yard fence.
  a.stamp(rows('bowl', 'R.R', 'RRR'), hx + hw + 1, g - 2, L)
  if (w > 16) a.stamp(rows('fence', 'e..e..e', 'eeeeeee', 'e..e..e'), hx + hw + 5, g - 3, L)
  return finish(a)
}
