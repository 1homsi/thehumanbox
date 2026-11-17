import { Art, C, DOOR, ROOF, WALL, finish, flatRoof, isLit, legend, rows, wall } from './kit.ts'
import type { Look, Ramp } from './kit.ts'
import { plot, spread } from './house-forms.ts'
import { dome, drum } from './shapes.ts'

const W = (look: Look, least: number) => Math.max(least, look.fw * 8 - 2)
const GLASS: Ramp = [C.blue5, C.blue4, C.blue3, C.blue2]
const glow = (look: Look, day: number = C.blue4) => (isLit(look) ? C.gold5 : day)

/** Bands of window across a wall: a strip of glass on each floor, lit at night. */
function windowBands(a: Art, x: number, y: number, w: number, floors: number, floorH: number, look: Look) {
  for (let f = 0; f < floors; f++) {
    const fy = y + f * floorH + 1
    a.rect(x + 1, fy, w - 2, floorH - 2, isLit(look) && f % 2 === 0 ? C.gold4 : C.blue3)
    a.hline(x + 1, fy, w - 2, isLit(look) && f % 2 === 0 ? C.gold5 : C.blue4)
    for (let i = x + 4; i < x + w - 2; i += 4) a.vline(i, fy, floorH - 2, C.grey8)
  }
}

/**
 * A hospital: white wards over a canopied entrance, the red cross high on the front. The great hospital is
 * a tower between two lower wings, with a landing pad on its roof.
 */
export function hospital(look: Look): Art {
  const w = W(look, 22)
  const { a, g, x, cx } = plot(look, w)
  const L = legend(ROOF.stone, WALL.white, isLit(look))
  const big = look.kind === 'Hospital2'
  let crossY: number
  if (big) {
    const wingH = 17
    const towerW = Math.round(w * 0.4)
    const towerH = Math.min(look.fh * 8 + 2, 38)
    for (const wx of [x, x + w - Math.round(w * 0.36)]) {
      const ww = Math.round(w * 0.36)
      wall(a, wx, g - wingH, ww, wingH, WALL.white, false)
      windowBands(a, wx, g - wingH, ww, 3, 5, look)
      flatRoof(a, wx - 1, g - wingH - 2, ww + 2, 2, ROOF.stone)
    }
    const tx = cx - (towerW >> 1) + 1
    wall(a, tx, g - towerH, towerW, towerH, WALL.white, false)
    windowBands(a, tx, g - towerH + 10, towerW, Math.floor((towerH - 16) / 5), 5, look)
    flatRoof(a, tx - 1, g - towerH - 2, towerW + 2, 2, ROOF.stone)
    // The landing pad, on a deck over the roof.
    a.rect(tx + 1, g - towerH - 4, towerW - 2, 2, C.grey5).hline(tx + 1, g - towerH - 4, towerW - 2, C.grey7)
    a.stamp(rows('h', 'Y.Y', 'YYY', 'Y.Y'), cx - 1, g - towerH - 8, L)
    crossY = g - towerH + 1
  } else {
    const h = 4 * 5 + 6
    wall(a, x, g - h, w, h, WALL.white, false)
    windowBands(a, x, g - h, w, 4, 5, look)
    flatRoof(a, x - 1, g - h - 2, w + 2, 2, ROOF.stone)
    a.vline(x + w - 4, g - h - 7, 5, C.grey5).set(x + w - 4, g - h - 8, C.red4)
    crossY = g - h + 1
  }
  // The cross on its white panel.
  a.rect(cx - 3, crossY, 8, 8, C.grey9)
    .rect(cx, crossY + 1, 2, 6, C.red4)
    .rect(cx - 2, crossY + 3, 6, 2, C.red4)
  // The entrance: glass doors under a red canopy, and an ambulance waiting.
  a.rect(cx - 6, g - 7, 14, 2, C.red4).hline(cx - 6, g - 5, 14, C.red2)
  a.stamp(DOOR.glass, cx - 3, g - 5, L).stamp(DOOR.glass, cx + 1, g - 5, L)
  a.stamp(rows('ambulance', 'hhhhh.', 'hRhhii', 'hhhhhh', 'o...o.'), x + 2, g - 4, L)
  return finish(a)
}

/** A data centre: a windowless dark hall, rows of status lights, and cooling fans on the roof. */
export function datacenter(look: Look): Art {
  const w = W(look, 22)
  const { a, g, x } = plot(look, w)
  const dark: Ramp = [C.grey5, C.grey4, C.grey3, C.grey2]
  wall(a, x, g - 12, w, 12, dark, false)
  a.hline(x, g - 12, w, C.grey6)
  // Racks behind louvres: three rows of lights, green with one amber.
  for (let j = 0; j < 3; j++)
    for (let i = x + 2; i < x + w - 2; i += 3)
      a.set(i, g - 9 + j * 3, (i + j) % 7 === 0 ? C.gold4 : isLit(look) ? C.green4 : C.green3)
  for (let i = x + 1; i < x + w - 1; i += 6) a.vline(i, g - 11, 10, C.grey3)
  a.rect(x + 2, g - 5, 3, 5, C.grey2)
  // The cooling plant.
  for (const fx of spread(x, w, Math.floor(w / 9), 6)) {
    a.rect(fx, g - 16, 6, 4, C.grey7)
      .hline(fx, g - 16, 6, C.grey9)
      .rect(fx + 1, g - 15, 4, 2, C.grey4)
      .set(fx + 2, g - 15, C.grey6)
  }
  return finish(a)
}

/** A research lab: a white block with a glass hall, a small dome and a dish on the roof. */
export function researchLab(look: Look): Art {
  const w = W(look, 22)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.stone, WALL.white, isLit(look))
  const half = Math.round(w * 0.55)
  wall(a, x, g - 12, half, 12, WALL.white, false)
  windowBands(a, x, g - 12, half, 2, 5, look)
  a.stamp(DOOR.glass, x + 2, g - 5, L)
  flatRoof(a, x - 1, g - 14, half + 2, 2, ROOF.stone)
  // The glass hall, lower, with a blue stripe.
  a.rect(x + half, g - 9, w - half, 9, C.blue3).hline(x + half, g - 9, w - half, C.blue5)
  for (let i = x + half + 3; i < x + w; i += 4) a.vline(i, g - 9, 9, C.grey9)
  a.hline(x + half, g - 5, w - half, C.grey9).vline(x + w - 1, g - 9, 9, C.blue2)
  if (isLit(look)) a.rect(x + half + 1, g - 4, 2, 3, C.gold5)
  // The dome and the dish.
  dome(a, x + 5, g - 14 - 4, 4, [C.grey9, C.grey9, C.grey8, C.grey7])
  a.rect(x + 6, g - 17, 1, 3, C.blue1)
  a.stamp(rows('dish', '.sss', 'ssot', '.tt.', '..u.'), x + half - 6, g - 18, L)
  return finish(a)
}

/** A broadcasting studio: a low block, a mast with its red light, and a dish. */
export function studio(look: Look): Art {
  const w = W(look, 14)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.dark, WALL.concrete, isLit(look))
  wall(a, x, g - 9, w, 9, WALL.concrete, false)
  a.rect(x, g - 9, w, 2, C.plum2)
  a.rect(x + 6, g - 6, w - 8, 3, L.x).hline(x + 6, g - 6, w - 8, L.w)
  a.stamp(DOOR.glass, x + 1, g - 5, L)
  flatRoof(a, x - 1, g - 11, w + 2, 2, ROOF.dark)
  // "On air": a red lamp over the door.
  a.rect(x + 2, g - 8, 2, 1, isLit(look) ? C.red5 : C.red3)
  const mh = Math.min(look.fh * 8 + 6, 20)
  a.vline(x + w - 4, g - 11 - mh, mh, C.grey5)
  for (let j = 3; j < mh; j += 4) a.hline(x + w - 5, g - 11 - mh + j, 3, C.grey5)
  a.set(x + w - 4, g - 12 - mh, C.red4)
  a.stamp(rows('dish', '.sss.', 'sssst', 'ssott', '.ttt.', '..u..'), x + 2, g - 16, L)
  return finish(a)
}

/** An airport: the terminal under a curved roof, the control tower, and a plane on the apron. */
export function airport(look: Look): Art {
  const w = W(look, 30)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.stone, WALL.white, isLit(look))
  const apron = 12
  // The apron and a strip of runway, with its centre line.
  a.rect(x, g - apron, w, apron, C.grey4).hline(x, g - apron, w, C.grey5)
  for (let i = x + 2; i < x + w - 3; i += 6) a.hline(i, g - 3, 3, C.grey9)
  // The plane: fuselage, swept wings, tail.
  a.stamp(
    rows('plane', '....h.......', '....hh......', 'lhhhhhhhhhhs', '....hh....R.', '....h.......'),
    x + 3,
    g - apron + 3,
    L,
  )
  // The terminal: glass under a roof that curves down at each end.
  const tw = Math.round(w * 0.68)
  const ty = g - apron
  a.rect(x, ty - 9, tw, 9, C.blue3).hline(x, ty - 9, tw, C.blue5)
  for (let i = x + 3; i < x + tw; i += 4) a.vline(i, ty - 9, 9, C.grey9)
  a.hline(x, ty - 5, tw, C.grey9)
  if (isLit(look)) for (let i = x + 1; i < x + tw - 1; i += 8) a.rect(i, ty - 4, 2, 3, C.gold5)
  a.rect(x - 1, ty - 11, tw + 2, 2, C.grey9).hline(x - 1, ty - 10, tw + 2, C.grey7)
  a.hline(x + 1, ty - 12, tw - 2, C.grey9).hline(x + 4, ty - 13, tw - 8, C.grey8)
  // The control tower: a stalk and a glazed cab under a flat cap.
  const cxT = x + w - 7
  const th = Math.min(look.fh * 5, 28)
  drum(a, cxT, ty - th, 4, th, WALL.concrete)
  a.rect(cxT - 2, ty - th - 4, 8, 4, glow(look, C.blue5)).hline(cxT - 2, ty - th - 1, 8, C.grey7)
  for (let i = cxT; i < cxT + 6; i += 2) a.vline(i, ty - th - 4, 3, C.grey4)
  a.hline(cxT - 3, ty - th - 5, 10, C.grey9)
    .vline(cxT + 2, ty - th - 9, 4, C.grey5)
    .set(cxT + 2, ty - th - 10, C.red4)
  return finish(a)
}

/** A petrol station: pumps under a wide canopy, and the shop behind. */
export function gasStation(look: Look): Art {
  const w = W(look, 14)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.stone, WALL.white, isLit(look))
  const sw = 9
  wall(a, x + w - sw, g - 8, sw, 8, WALL.white, false)
  a.rect(x + w - sw + 1, g - 6, sw - 6, 3, L.x).hline(x + w - sw + 1, g - 6, sw - 6, L.w)
  a.stamp(DOOR.glass, x + w - 5, g - 5, L)
  flatRoof(a, x + w - sw - 1, g - 10, sw + 2, 2, ROOF.stone)
  // The canopy: red and yellow edge, two posts.
  a.rect(x - 1, g - 13, w - sw + 4, 3, C.red4)
    .hline(x - 1, g - 13, w - sw + 4, C.gold5)
    .hline(x - 1, g - 11, w - sw + 4, C.red2)
  a.vline(x, g - 10, 10, C.grey8).vline(x + w - sw + 1, g - 10, 2, C.grey8)
  // The pumps.
  for (const px of [x + 3, x + 7])
    a.rect(px, g - 5, 3, 5, C.grey9)
      .rect(px, g - 5, 3, 2, C.red4)
      .set(px + 1, g - 3, C.grey3)
      .vline(px + 2, g - 3, 3, C.grey7)
  return finish(a)
}

/** An office tower: glass in stepped setbacks, a mast on the top. */
export function officeTower(look: Look): Art {
  const w = W(look, 14)
  const { a, g, cx } = plot(look, w)
  const h = Math.min(look.fh * 8 + 8, 40)
  const tiers = 3
  let y = g
  for (let t = 0; t < tiers; t++) {
    const tw = w - t * 6
    const th = t === 0 ? Math.round(h * 0.5) : Math.round(h * 0.25)
    const tx = cx - (tw >> 1) + 1
    a.rect(tx, y - th, tw, th, GLASS[2])
    for (let j = y - th + 2; j < y - 1; j += 3) a.hline(tx, j, tw, GLASS[3])
    for (let j = y - th; j < y; j++)
      for (let i = 0; i < Math.round(tw * 0.35); i++)
        if (a.get(tx + i, j) === GLASS[2]) a.set(tx + i, j, GLASS[1])
    if (isLit(look))
      for (let j = y - th + 3; j < y - 2; j += 6) a.rect(tx + 2 + ((j / 3) & 1) * 3, j, 2, 2, C.gold5)
    a.vline(tx + tw - 1, y - th, th, C.blue1)
      .hline(tx - 1, y - th - 1, tw + 2, C.grey9)
      .hline(tx - 1, y - th, tw + 2, C.grey7)
    y -= th + 1
  }
  a.rect(cx - 1, g - 4, 4, 4, glow(look, C.blue5))
  a.vline(cx, y - 6, 6, C.grey6).set(cx, y - 7, C.red4)
  return finish(a)
}

// ── The future ────────────────────────────────────────────────────────────────────────────────────

/** A spaceport: the pad, the gantry, the fuel spheres and, unless it has just left, the rocket. */
export function spaceport(look: Look): Art {
  const w = W(look, 30)
  const { a, g, x, cx } = plot(look, w)
  const L = legend(ROOF.stone, WALL.white, isLit(look))
  // The pad, edged in hazard stripes.
  a.rect(x, g - 4, w, 4, C.grey5).hline(x, g - 4, w, C.grey7)
  for (let i = 0; i < w; i += 4) a.rect(x + i, g - 1, 2, 1, C.gold5)
  // The gantry: a red lattice tower with arms.
  const gh = Math.min(look.fh * 8, 44)
  const gx = cx - 9
  for (let j = 0; j < gh; j++) {
    a.set(gx, g - 4 - j, C.red4).set(gx + 3, g - 4 - j, C.red3)
    a.set(gx + 1 + (j % 4 < 2 ? 0 : 1), g - 4 - j, C.red3)
    if (j % 4 === 0) a.hline(gx, g - 4 - j, 4, C.red4)
  }
  a.hline(gx + 4, g - 4 - Math.round(gh * 0.7), 4, C.red3).hline(
    gx + 4,
    g - 4 - Math.round(gh * 0.35),
    4,
    C.red3,
  )
  a.set(gx + 1, g - 5 - gh, isLit(look) ? C.red5 : C.red4)
  // Fuel: two white spheres on legs.
  for (const sx of [x + w - 9, x + w - 17]) {
    dome(a, sx + 3, g - 12, 4, [C.grey9, C.grey9, C.grey8, C.grey7])
    a.rect(sx, g - 8, 8, 2, C.grey8)
      .hline(sx + 1, g - 6, 6, C.grey7)
      .vline(sx + 1, g - 6, 2, C.grey5)
      .vline(sx + 6, g - 6, 2, C.grey5)
  }
  if (look.state === 'empty') {
    // Just launched: a scorch on the pad.
    a.rect(cx - 2, g - 4, 7, 2, C.grey3).hline(cx - 1, g - 4, 5, C.grey2)
    return finish(a)
  }
  // The rocket: white, a red nose, a blue band, fins and the engine bell.
  const rh = Math.round(gh * 0.86)
  const rx = cx - 1
  a.rect(rx, g - 6 - rh + 4, 5, rh - 4, C.grey9)
    .vline(rx + 3, g - 6 - rh + 4, rh - 4, C.grey8)
    .vline(rx + 4, g - 6 - rh + 4, rh - 4, C.grey7)
  a.stamp(rows('nose', '..R..', '.RRr.', '.RRr.', 'RRRrq'), rx, g - 6 - rh, L)
  a.rect(rx, g - 6 - Math.round(rh * 0.55), 5, 2, C.blue3).rect(rx + 1, g - 6 - rh + 7, 2, 2, C.blue4)
  a.stamp(rows('fins', 'R.....R', 'RR...RR', 'RRo.oRq'), rx - 1, g - 9, L)
  a.rect(rx + 1, g - 6, 3, 2, C.grey4)
  return finish(a)
}

/** An orbital lift: the anchor station, the tether going up out of sight, a climber on it. */
export function orbitalLift(look: Look): Art {
  const w = W(look, 14)
  const { a, g, cx } = plot(look, w)
  const r = Math.min(8, (w >> 1) - 2)
  const h = look.fh * 8 + 16
  // The tether, then the anchor it is fixed to.
  a.vline(cx, g - h, h - r, C.grey7).vline(cx + 1, g - h, h - r, C.grey5)
  for (let j = g - h + 3; j < g - r - 4; j += 8) a.set(cx, j, glow(look, C.blue5))
  dome(a, cx, g - r - 3, r, [C.grey9, C.grey8, C.grey7, C.grey6])
  a.rect(cx - r, g - 3, r * 2 + 2, 3, C.grey5).hline(cx - r, g - 3, r * 2 + 2, C.grey7)
  for (let i = -r + 2; i < r; i += 3) a.set(cx + i, g - 2, glow(look))
  // The climber: a gold car part-way up.
  a.rect(cx - 2, g - Math.round(h * 0.6), 6, 4, C.gold4)
    .hline(cx - 2, g - Math.round(h * 0.6), 6, C.gold5)
    .rect(cx - 1, g - Math.round(h * 0.6) + 1, 4, 1, C.blue2)
  return finish(a)
}

/** A fusion plant: a steel ring held over the reactor hall, the plasma showing only along its inner edge. */
export function fusionPlant(look: Look): Art {
  const w = W(look, 22)
  const { a, g, x, cx } = plot(look, w)
  const dark: Ramp = [C.grey6, C.grey5, C.grey4, C.grey3]
  wall(a, x + 2, g - 10, w - 4, 10, dark, false)
  a.hline(x + 2, g - 10, w - 4, C.grey7)
  for (let i = x + 4; i < x + w - 4; i += 5) a.rect(i, g - 7, 3, 2, isLit(look) ? C.plum5 : C.plum4)
  a.rect(cx - 1, g - 4, 4, 4, C.grey2)
  // The torus, seen from a little above: steel outside, a line of plasma inside, the hole dark.
  const rx = (w >> 1) - 1
  const ry = 6
  const cy = g - 17
  for (let j = -ry; j <= ry; j++)
    for (let i = -rx; i <= rx; i++) {
      const d = (i / rx) ** 2 + (j / ry) ** 2
      if (d > 1) continue
      a.set(
        cx + i,
        cy + j,
        d < 0.22
          ? C.grey2
          : d < 0.34
            ? isLit(look)
              ? C.plum5
              : C.plum4
            : j < -ry * 0.3
              ? C.grey8
              : i > rx * 0.5 || j > ry * 0.4
                ? C.grey6
                : C.grey7,
      )
    }
  // Field coils: bands of copper round the ring.
  for (const i of [-rx + 3, -(rx >> 1), rx >> 1, rx - 3])
    for (let j = -ry; j <= ry; j++) {
      const c = a.get(cx + i, cy + j)
      if (c === C.grey8 || c === C.grey7 || c === C.grey6) a.set(cx + i, cy + j, C.gold3)
    }
  // The legs that carry it.
  a.vline(x + 4, g - 12, 2, C.grey5).vline(x + w - 5, g - 12, 2, C.grey5)
  return finish(a)
}

/** A neural hub: a ribbed dome of violet glass on a ring wall, a node of light at each rib, an aerial on top. */
export function neuralHub(look: Look): Art {
  const w = W(look, 22)
  const { a, g, x, cx } = plot(look, w)
  const r = [8, 9, 10, 12, 14].filter((v) => v * 2 <= w).pop() ?? 8
  const wallH = 5
  // The ring wall, with a band of light round it.
  a.rect(x, g - wallH, w, wallH, C.grey6)
    .hline(x, g - wallH, w, C.grey8)
    .rect(x + w - 3, g - wallH + 1, 3, wallH - 1, C.grey5)
  a.hline(x + 1, g - 3, w - 2, glow(look, C.blue4))
  a.rect(cx - 1, g - 4, 4, 4, C.grey3)
  dome(a, cx, g - wallH - r, r, [C.plum5, C.plum4, C.plum3, C.plum2])
  // The ribs, and a node where each meets the wall.
  for (const off of [-Math.round(r * 0.62), 0, Math.round(r * 0.62)]) {
    for (let j = 0; j < r; j++)
      if (a.get(cx + off, g - wallH - r + j) && a.get(cx + off, g - wallH - r + j) !== C.grey6)
        a.set(cx + off, g - wallH - r + j, C.grey9)
    a.rect(cx + off, g - wallH - 1, 2, 2, glow(look, C.blue5))
  }
  a.vline(cx, g - wallH - r - 5, 5, C.grey7).set(cx, g - wallH - r - 6, glow(look, C.plum5))
  return finish(a)
}

/** An AI core: a black monolith, one lit eye, slits of light down its face, coolant pipes at its foot. */
export function aiCore(look: Look): Art {
  const w = W(look, 14) - 4
  const { a, g, cx } = plot(look, w)
  const h = Math.min(look.fh * 8 + 8, 30)
  const x = cx - (w >> 1) + 1
  a.rect(x, g - h, w, h, C.grey2)
    .vline(x, g - h, h, C.grey4)
    .vline(x + 1, g - h, h, C.grey3)
    .vline(x + w - 1, g - h, h, C.grey1)
  a.hline(x, g - h, w, C.grey4)
  const eye = glow(look, C.blue4)
  a.stamp(rows('eye', '.AAAA.', 'A....A', 'A.BB.A', 'A.BB.A', 'A....A', '.AAAA.'), cx - 2, g - h + 3, {
    A: eye,
    B: C.blue5,
  })
  // Slits of light, shorter as they go down: the machine thinking.
  for (let k = 0, j = g - h + 12; j < g - 6; k++, j += 3)
    a.hline(x + 3 + (k % 2), j, w - 6 - (k % 3), k % 2 ? C.blue2 : C.blue3)
  // The plinth, and the coolant pipes running out of it.
  a.rect(x - 1, g - 3, w + 2, 3, C.grey4).hline(x - 1, g - 3, w + 2, C.grey5)
  a.hline(x - 3, g - 1, 3, C.blue4)
    .hline(x + w, g - 1, 3, C.blue4)
    .set(x - 3, g - 2, C.blue4)
    .set(x + w + 2, g - 2, C.blue4)
  return finish(a)
}

/** The great biodome: a jungle under glass, with a waterfall. */
export function biodome(look: Look): Art {
  const w = W(look, 22)
  const { a, g, cx } = plot(look, w)
  const r = [10, 12, 14, 16, 20].filter((v) => v * 2 <= w + 2).pop() ?? 10
  const top = g - r - 2
  dome(a, cx, top, r, [C.grey9, C.blue5, C.blue4, C.blue3])
  const L = legend(ROOF.moss, WALL.white)
  // The forest floor and the canopy, seen through the glass.
  for (let j = Math.round(r * 0.6); j < r; j++)
    for (let i = -r; i <= r; i++)
      if (a.get(cx + i, top + j)) a.set(cx + i, top + j, j < r * 0.7 ? C.green3 : C.green2)
  const tree = rows('tree', '.MNN.', 'MNNNn', 'NNNnn', '.NnI.', '..I..')
  for (const tx of spread(cx - r + 3, r * 2 - 6, Math.floor(r / 4), 5))
    a.stamp(tree, tx, top + Math.round(r * 0.6) - 4, L)
  // The waterfall and its pool.
  a.vline(cx + 2, top + Math.round(r * 0.45), Math.round(r * 0.4), C.grey9).vline(
    cx + 3,
    top + Math.round(r * 0.45),
    Math.round(r * 0.4),
    C.blue5,
  )
  a.hline(cx, top + r - 2, 6, C.blue4)
  // The frame.
  for (let j = 0; j < r * 0.5; j++) a.set(cx - (j >> 1), top + j, C.grey9)
  a.rect(cx - r + 1, g - 2, r * 2, 2, C.grey7).hline(cx - r + 1, g - 2, r * 2, C.grey9)
  a.rect(cx - 2, g - 5, 5, 5, C.grey6).rect(cx - 1, g - 4, 3, 4, glow(look, C.blue1))
  return finish(a)
}

/** A cryo lab: a pale block and its frosted tanks, cold vapour lying round them. */
export function cryolab(look: Look): Art {
  const w = W(look, 14)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.stone, WALL.ice, isLit(look))
  const bw = Math.round(w * 0.55)
  wall(a, x, g - 12, bw, 12, WALL.ice, false)
  a.rect(x + 2, g - 10, bw - 4, 3, C.blue3).hline(x + 2, g - 10, bw - 4, glow(look, C.blue5))
  a.stamp(DOOR.glass, x + 2, g - 5, L)
  flatRoof(a, x - 1, g - 14, bw + 2, 2, ROOF.stone)
  // The snowflake.
  a.stamp(rows('flake', 'l.l.l', '.lll.', 'lllll', '.lll.', 'l.l.l'), x + (bw >> 1) - 2, g - 20, L)
  // Tanks, banded, with a gauge light each.
  for (const tx of spread(x + bw, w - bw, w - bw >= 12 ? 2 : 1, 5)) {
    drum(a, tx, g - 14, 5, 14, [C.grey9, C.blue5, C.blue4, C.blue3])
    a.hline(tx + 1, g - 15, 3, C.grey9)
      .hline(tx, g - 9, 5, C.blue3)
      .set(tx + 1, g - 6, glow(look, C.blue2))
  }
  a.hline(x + bw - 1, g - 1, w - bw + 2, C.grey9)
  return finish(a)
}

/** A nanofab: a white clean-room works under a saw-tooth roof, violet light in its slits, parts leaving on a belt. */
export function nanoFab(look: Look): Art {
  const w = W(look, 14)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.stone, WALL.white, isLit(look))
  wall(a, x, g - 11, w, 11, WALL.white, false)
  // The saw-tooth: three glazed teeth, each lit violet from inside.
  for (let i = 0; i + 6 <= w; i += 7) {
    for (let j = 0; j < 4; j++) a.hline(x + i, g - 15 + j, 3 + j, j === 0 ? C.grey9 : C.grey8)
    a.vline(x + i, g - 15, 4, isLit(look) ? C.plum5 : C.plum4)
  }
  a.hline(x, g - 11, w, C.grey7)
  for (let j = g - 9; j < g - 5; j += 3)
    a.hline(x + 2, j, w - 4, isLit(look) ? C.plum5 : C.plum4).hline(x + 2, j + 1, w - 4, C.plum2)
  // The loading door and the belt, with three finished cubes on it.
  a.rect(x + 2, g - 4, 5, 4, C.grey5)
    .hline(x + 2, g - 4, 5, C.grey7)
    .hline(x + 2, g - 2, 5, C.grey6)
  a.hline(x + 8, g - 2, w - 7, C.grey5).hline(x + 8, g - 1, w - 7, C.grey3)
  for (let i = 0; i < 3 && 9 + i * 3 + 2 <= w; i++)
    a.rect(x + 9 + i * 3, g - 4, 2, 2, [C.blue4, C.gold5, C.plum4][i])
  // Two vent stacks.
  a.stamp(rows('vent', 'ooo', 'tuv', 'tuv', 'tuv'), x + w - 4, g - 19, L)
  return finish(a)
}

/** One wind turbine: a white mast, the nacelle, three blades. Its foot is at (cx, g). */
function turbine(a: Art, cx: number, g: number, h: number, turn: number) {
  a.vline(cx, g - h, h, C.grey9).vline(cx + 1, g - h + (h >> 1), h >> 1, C.grey7)
  a.rect(cx - 1, g - h - 1, 4, 2, C.grey8)
  // Blades: three arms, a different pose for each turbine so a farm is not in step.
  const poses: [number, number][][] = [
    [
      [0, -1],
      [1, 1],
      [-1, 1],
    ],
    [
      [1, 0],
      [-1, -1],
      [-1, 1],
    ],
    [
      [0, 1],
      [1, -1],
      [-1, -1],
    ],
  ]
  for (const [dx, dy] of poses[turn % 3])
    for (let i = 1; i <= 7; i++) a.set(cx + dx * i, g - h + dy * i, i > 5 ? C.grey8 : C.grey9)
  a.set(cx, g - h, C.grey5)
}

/** A wind turbine, or a farm of three. */
export function windTurbine(look: Look): Art {
  const farm = look.kind === 'WindFarm'
  const w = W(look, 12)
  const { a, g, x, cx } = plot(look, w)
  const h = Math.min(look.fh * 8 + 12, farm ? 38 : 26)
  if (farm) {
    turbine(a, x + 6, g - 4, h - 8, 0)
    turbine(a, x + w - 7, g - 2, h - 5, 1)
    turbine(a, cx, g, h, 2)
  } else {
    turbine(a, cx, g, h, look.variant)
  }
  return finish(a)
}

/** A line raised on pylons: the hyperloop's glass tube with a pod in it, or the maglev's train on its beam. */
export function transitLine(look: Look): Art {
  const w = look.fw * 8
  const a = new Art(w + 4, 16)
  const g = 14
  const tube = look.kind === 'Hyperloop'
  for (let i = 3; i < w; i += 8) a.rect(2 + i, g - 5, 2, 5, C.grey6).vline(2 + i + 1, g - 5, 5, C.grey5)
  if (tube) {
    a.rect(2, g - 9, w, 4, C.blue4)
      .hline(2, g - 9, w, C.grey9)
      .hline(2, g - 6, w, C.blue3)
    for (let i = 7; i < w; i += 8) a.vline(2 + i, g - 9, 4, C.grey8)
    a.rect(2 + (w >> 1) - 4, g - 8, 8, 2, C.grey9).set(2 + (w >> 1) + 3, g - 8, glow(look, C.red4))
  } else {
    a.rect(2, g - 6, w, 2, C.grey7).hline(2, g - 6, w, C.grey9)
    // The train: a white wedge with a band of window.
    const tx = 2 + (w >> 1) - 9
    a.rect(tx + 2, g - 10, 16, 4, C.grey9)
      .hline(tx + 4, g - 11, 12, C.grey9)
      .set(tx + 1, g - 8, C.grey9)
      .set(tx + 1, g - 7, C.grey9)
      .set(tx, g - 7, C.grey8)
    a.hline(tx + 3, g - 9, 14, glow(look, C.blue3))
      .hline(tx + 2, g - 7, 16, C.blue3)
      .set(tx + 18, g - 8, C.red4)
  }
  return finish(a)
}

/** One block of the megastructure: white structure, ranks of windows, a lit edge and a shaded one. */
function megaBlock(a: Art, x: number, g: number, w: number, h: number, look: Look) {
  a.rect(x, g - h, w, h, C.grey8)
    .vline(x, g - h, h, C.grey9)
    .rect(x + w - 2, g - h, 2, h, C.grey6)
  a.hline(x, g - h, w, C.grey9)
  for (let j = g - h + 3; j < g - 2; j += 4) {
    a.hline(x + 2, j, w - 5, C.blue3).hline(x + 2, j + 1, w - 5, C.blue2)
    if (isLit(look))
      for (let i = x + 3 + ((j >> 2) % 3) * 2; i < x + w - 4; i += 7) a.rect(i, j, 2, 2, C.gold5)
  }
}

/**
 * A megastructure: a city in one building. Three towers of unequal height stand on one podium, joined by
 * bridges high in the air, each crowned differently: a spire, a landing pad, a garden.
 */
export function megastructure(look: Look): Art {
  const w = W(look, 30)
  const { a, g, x, cx } = plot(look, w)
  const total = Math.min(look.fh * 8 + 14, 74)
  const podium = 10
  const base = g - podium
  // The far tower first, then the two in front of it.
  const farW = Math.round(w * 0.26)
  const farH = Math.round((total - podium) * 0.62)
  megaBlock(a, x + w - farW - 2, base, farW, farH, look)
  const mainW = Math.round(w * 0.34)
  const mainX = cx - (mainW >> 1) - 2
  megaBlock(a, mainX, base, mainW, total - podium, look)
  const nearW = Math.round(w * 0.24)
  const nearH = Math.round((total - podium) * 0.4)
  megaBlock(a, x + 2, base, nearW, nearH, look)
  // The bridges: one from the near tower, one to the far tower, at different heights.
  a.rect(x + 2 + nearW, base - nearH + 4, mainX - (x + 2 + nearW), 2, C.blue4).hline(
    x + 2 + nearW,
    base - nearH + 6,
    mainX - (x + 2 + nearW),
    C.grey6,
  )
  const fx = mainX + mainW
  a.rect(fx, base - farH + 8, x + w - farW - 2 - fx, 2, C.blue4).hline(
    fx,
    base - farH + 10,
    x + w - farW - 2 - fx,
    C.grey6,
  )
  // The crowns: a spire on the tallest, a pad on the far tower, trees on the near one.
  a.vline(mainX + (mainW >> 1), base - (total - podium) - 9, 9, C.grey7).set(
    mainX + (mainW >> 1),
    base - (total - podium) - 10,
    isLit(look) ? C.red5 : C.red4,
  )
  a.hline(x + w - farW - 3, base - farH - 1, farW + 2, C.grey5).rect(
    x + w - farW + 1,
    base - farH - 2,
    3,
    1,
    C.gold5,
  )
  for (let i = 1; i + 3 < nearW; i += 4)
    a.stamp(rows('tree', '.MN.', 'MNNn', '.nn.'), x + 2 + i, base - nearH - 3, legend(ROOF.moss, WALL.white))
  // The podium: one wide dark base, a strip of light along it, the gate at the middle.
  a.rect(x, base, w, podium, C.grey5)
    .hline(x, base, w, C.grey7)
    .rect(x + w - 3, base + 1, 3, podium - 1, C.grey4)
  a.hline(x + 2, base + 3, w - 5, glow(look, C.blue4))
  a.rect(cx - 3, g - 6, 7, 6, C.grey3).rect(cx - 2, g - 5, 5, 5, glow(look, C.blue5))
  return finish(a)
}
