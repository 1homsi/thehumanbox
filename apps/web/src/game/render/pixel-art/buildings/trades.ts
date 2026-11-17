import { Art, C, CHIMNEY, DOOR, ROOF, WALL, WINDOW, finish, flatRoof, isLit, legend, rows, slabRoof, wall } from './kit.ts'
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
  Smithy: rows('anvil', 'ooooo', '.ooo.', '..o..', '.ooo.'),
  ArtGallery: rows('frame', 'eeeee', 'eRlNe', 'eYPle', 'eeeee'),
  MusicHall: rows('note', '..ooo', '..o.o', 'oo.oo', 'oo.oo'),
  Theatre: rows('mask', 'hhhhh', 'hohoh', 'hhhhh', '.hoh.'),
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

interface ShopSpec {
  wall: Ramp
  roof: Ramp
  /** The two stripes of the awning over the shop window; none for a shop without one. */
  awning?: readonly [number, number]
  /** Floors above the shop. */
  upper?: number
  timber?: boolean
  /** A flat roof with the sign on a fascia, not a pitched roof with a board. */
  modern?: boolean
  chimney?: readonly string[]
}

const TIMBER: ShopSpec = { wall: WALL.plaster, roof: ROOF.tile, timber: true, chimney: CHIMNEY.stone }

const SHOPS: Record<string, ShopSpec> = {
  Bakery: { ...TIMBER, awning: [C.gold4, C.grey9], chimney: CHIMNEY.brick },
  Butcher: { ...TIMBER, awning: [C.red4, C.grey9], roof: ROOF.wood },
  Fishmonger: { ...TIMBER, awning: [C.blue3, C.grey9], roof: ROOF.slate, wall: WALL.wood },
  Cheesemonger: { ...TIMBER, awning: [C.gold5, C.gold3], roof: ROOF.straw },
  Tailor: { ...TIMBER, awning: [C.plum3, C.grey9], roof: ROOF.plum },
  Cobbler: { wall: WALL.wood, roof: ROOF.wood, awning: [C.gold2, C.tan5] },
  ClothingShop: { wall: WALL.daub, roof: ROOF.plum, awning: [C.plum4, C.grey9] },
  Jeweler: { wall: WALL.stone, roof: ROOF.slate, awning: [C.blue4, C.grey9] },
  Apothecary: { ...TIMBER, awning: [C.green3, C.grey9], roof: ROOF.moss },
  Herbalist: { wall: WALL.wood, roof: ROOF.moss, awning: [C.green2, C.green4] },
  Barbershop: { wall: WALL.white, roof: ROOF.slate, awning: [C.red4, C.blue3] },
  Scribe: { ...TIMBER, awning: [C.tan3, C.tan5], roof: ROOF.slate },
  BookStore: { wall: WALL.brick, roof: ROOF.slate, awning: [C.blue2, C.tan5] },
  Cafe: { wall: WALL.daub, roof: ROOF.wood, awning: [C.gold2, C.grey9] },
  Restaurant: { wall: WALL.brick, roof: ROOF.dark, awning: [C.red3, C.grey9] },
  PostOffice: { wall: WALL.brick, roof: ROOF.slate, awning: [C.blue3, C.gold5] },
  Goldsmith: { wall: WALL.stone, roof: ROOF.straw, awning: [C.gold4, C.gold2] },
  Kennel: { wall: WALL.wood, roof: ROOF.tile },
  Pharmacy: { wall: WALL.white, roof: ROOF.stone, modern: true, awning: [C.green3, C.grey9] },
  Clinic: { wall: WALL.white, roof: ROOF.stone, modern: true, awning: [C.red4, C.grey9] },
  Spa: { wall: WALL.white, roof: ROOF.plum, awning: [C.plum4, C.plum5] },
  Supermarket: { wall: WALL.concrete, roof: ROOF.stone, modern: true, awning: [C.red4, C.red4] },
  MallShop: { wall: WALL.concrete, roof: ROOF.stone, modern: true, awning: [C.blue3, C.blue3], upper: 1 },
}

/**
 * A shop: a house with a shop window and a door under a striped awning, and the trade's signboard on the
 * roof. Shops on bigger plots have rooms above.
 */
export function shop(look: Look): Art {
  const s = SHOPS[look.kind] ?? TIMBER
  const w = Math.max(8, look.fw * 8 - 2)
  const { a, g, x, cx } = plot(look, w)
  const L = legend(s.roof, s.wall, isLit(look))
  const upper = s.upper ?? (look.fh >= 3 ? 1 : 0)
  const gh = 9
  const wh = gh + upper * 7
  const wy = g - wh
  wall(a, x, wy, w, wh, s.wall)
  if (s.timber) {
    a.vline(x, wy, wh, C.gold1).vline(x + w - 1, wy, wh, C.gold1)
    if (upper) a.hline(x, wy + upper * 7, w, C.gold1)
  }
  for (let f = 0; f < upper; f++)
    for (const wx of spread(x, w, w >= 20 ? 3 : 2, 4)) a.stamp(WINDOW.framed, wx, wy + f * 7 + 2, L)
  // The shop front: the door at one end, glass across the rest.
  const doorLeft = (look.variant & 1) === 0
  const dx = doorLeft ? x + 1 : x + w - 5
  a.stamp(s.modern ? DOOR.glass : DOOR.plank, dx, g - (s.modern ? 5 : 6), L)
  const gx = doorLeft ? x + 6 : x + 1
  const gw = w - 7
  a.rect(gx, g - 6, gw, 5, C.gold1).rect(gx + 1, g - 5, gw - 2, 3, L.x).hline(gx + 1, g - 5, gw - 2, L.w)
  a.hline(gx, g - 2, gw, s.wall[2])
  if (s.awning) {
    for (let i = 0; i < w + 2; i++) {
      const stripe = (i >> 1) % 2 === 0
      a.set(x - 1 + i, g - 9, stripe ? s.awning[0] : s.awning[1])
      a.set(x - 1 + i, g - 8, stripe ? s.awning[0] : s.awning[1])
    }
    a.hline(x - 1, g - 7, w + 2, s.wall[3])
  }
  if (s.modern) {
    // A flat roof, and the sign across a fascia in the trade's colour.
    flatRoof(a, x - 1, wy - 2, w + 2, 2, s.roof)
    if (s.awning) a.rect(x - 1, wy, w + 2, 3, s.awning[0])
    signboard(a, look.kind, cx - 2, wy - 5, L)
  } else {
    const rh = w >= 20 ? 7 : 6
    slabRoof(a, x - 1, wy - rh, w + 2, rh, s.roof, 2)
    if (s.chimney) a.stamp(s.chimney, doorLeft ? x + w - 5 : x + 2, wy - rh - 3, L)
    signboard(a, look.kind, cx - 2, wy - rh - 3, L)
  }
  return finish(a)
}

/** An inn, tavern or brewery: two timbered floors, a lantern at the door, and its trade at the side. */
export function inn(look: Look): Art {
  const w = Math.max(14, look.fw * 8 - 2)
  const { a, g, x, cx } = plot(look, w)
  const roof = look.kind === 'Tavern' ? ROOF.wood : look.kind === 'Brewery' ? ROOF.slate : ROOF.tile
  const L = legend(roof, WALL.plaster, isLit(look))
  const mainW = look.kind === 'Brewery' ? w - 6 : w
  const wy = g - 15
  wall(a, x, wy, mainW, 15, WALL.plaster)
  a.vline(x, wy, 15, C.gold1).vline(x + mainW - 1, wy, 15, C.gold1).hline(x, wy + 7, mainW, C.gold1)
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
    a.rect(vx, g - 9, 6, 9, C.gold3).vline(vx, g - 9, 9, C.gold5).rect(vx + 4, g - 9, 2, 9, C.gold2)
    a.hline(vx, g - 6, 6, C.gold1).hline(vx, g - 3, 6, C.gold1)
    a.rect(vx - 1, g - 11, 8, 2, roof[2]).hline(vx - 1, g - 11, 8, roof[0])
    a.vline(vx + 3, g - 16, 5, C.grey5).vline(vx + 2, g - 16, 5, C.grey7)
  }
  void cx
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
  a.rect(cx + 3, g - 20, 2, 1, C.grey9).rect(cx + 5, g - 22, 2, 1, C.grey8).rect(cx + 3, g - 24, 1, 1, C.grey8)
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
    for (const wx of spread(x, w, 4, 4)) if (f < floorsN - 1 || Math.abs(wx + 2 - cx) > 5) a.stamp(WINDOW.sash, wx, wy + f * 7 + 1, L)
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
    a.vline(x, wy, wh, C.gold1).vline(x + w - 1, wy, wh, C.gold1).hline(x, wy + 6, w, C.gold1)
    for (const wx of spread(x, w, 3, 4)) a.stamp(WINDOW.framed, wx, wy + 1, L)
    a.stamp(rows('banner', 'LYL', 'LYL', 'LYL', 'L.L'), cx - 6, g - 7, L).stamp(rows('banner', 'LYL', 'LYL', 'LYL', 'L.L'), cx + 5, g - 7, L)
  } else if (kind === 'ArtGallery') {
    // Tall bright windows with a picture hung in each.
    const pics = [C.red4, C.blue3, C.gold4, C.green3]
    spread(x, w, 3, 5).forEach((wx, i) => {
      if (Math.abs(wx + 2 - cx) < 4) return
      a.rect(wx, wy + 3, 5, 9, C.grey8).rect(wx + 1, wy + 5, 3, 4, pics[i % 4]).hline(wx + 1, wy + 5, 3, pics[(i + 1) % 4])
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
  a.rect(cx - 7, wy - 6, 16, 4, C.tan5).hline(cx - 7, wy - 6, 16, C.grey9).vline(cx + 8, wy - 5, 3, C.tan3)
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

/** A kennel: a low wooden house with a round dog door and a bone over it. */
export function kennel(look: Look): Art {
  const w = Math.max(12, look.fw * 8 - 4)
  const { a, g, x, cx } = plot(look, w)
  const L = legend(ROOF.tile, WALL.wood, isLit(look))
  wall(a, x, g - 7, w, 7, WALL.wood)
  for (let j = g - 5; j < g - 1; j += 2) a.hline(x, j, w - 1, C.tan1)
  slabRoof(a, x - 1, g - 12, w + 2, 5, ROOF.tile, 2)
  a.stamp(rows('dogdoor', '.kk.', 'kkkk', 'kkkk', 'kkkk'), cx - 1, g - 4, L)
  a.stamp(SIGNS.Kennel.slice(1), cx - 2, g - 15, L)
  // The yard fence.
  a.stamp(rows('fence', 'e.e.e', 'eeeee', 'e.e.e'), x + w, g - 3, L)
  return finish(a)
}
