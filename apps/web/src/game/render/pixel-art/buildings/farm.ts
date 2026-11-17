import { Art, C, DOOR, INK, ROOF, WALL, WINDOW, finish, isLit, legend, rows, slabRoof, wall } from './kit.ts'
import type { Look } from './kit.ts'
import { plot, spread } from './house-forms.ts'
import { cone, dome, drum } from './shapes.ts'

const W = (look: Look, least: number) => Math.max(least, look.fw * 8 - 2)

/** A small round tree, four pixels wide: the size of everything planted in rows. */
const bush = rows('bush', '.MN.', 'MNNn', 'NNnn', '.nm.')

/** A post-and-rail fence along row `g`, `w` pixels long. */
export function rail(a: Art, x: number, g: number, w: number) {
  a.hline(x, g - 3, w, C.gold3).hline(x, g - 1, w, C.gold2)
  for (let i = 0; i < w; i += 4) a.vline(x + i, g - 4, 4, C.gold2)
  a.vline(x + w - 1, g - 4, 4, C.gold2)
}

/** A silo: a tall banded cylinder under a red cap, with its ladder. */
export function silo(look: Look): Art {
  const { a, g, cx } = plot(look, 10)
  const h = Math.min(22, look.fh * 8 + 6)
  drum(a, cx - 3, g - h, 8, h, [C.grey9, C.grey8, C.grey7, C.grey6])
  for (let j = g - h + 4; j < g - 1; j += 5) a.hline(cx - 3, j, 8, C.grey6)
  dome(a, cx, g - h - 4, 4, ROOF.tile)
  a.vline(cx + 3, g - h + 1, h - 1, C.grey4)
  a.rect(cx - 1, g - 3, 2, 3, C.grey4)
  return finish(a)
}

/** A barn: red boards, a gambrel roof, and big doors braced with a white cross. */
export function barn(look: Look): Art {
  const w = W(look, 12)
  const { a, g, x, cx } = plot(look, w)
  const L = legend(ROOF.dark, WALL.darkBrick, isLit(look))
  const red = [C.red4, C.red3, C.red3, C.red2] as const
  wall(a, x, g - 8, w, 8, red, false)
  // The gambrel: steep sides, then a shallower top.
  for (let j = 0; j < 7; j++) {
    const inset = j < 3 ? 5 - j * 1 - (j === 0 ? 1 : 0) : j < 5 ? 2 : 1
    const row = g - 15 + j
    for (let i = x - 1 + inset; i < x + w + 1 - inset; i++) a.set(i, row, i < cx ? ROOF.dark[1] : ROOF.dark[2])
    a.set(x - 1 + inset, row, ROOF.dark[0])
  }
  a.rect(cx - 3, g - 13, 8, 5, red[0]).vline(cx + 4, g - 13, 5, red[3])
  a.rect(cx - 1, g - 12, 4, 3, INK).hline(cx - 1, g - 13, 4, C.grey9)
  // The doors.
  a.stamp(rows('doors', 'hhhhhhhh', 'hqrhhrqh', 'hrhqqhrh', 'hrhqqhrh', 'hqrhhrqh', 'hrqrrqrh'), cx - 3, g - 6, L)
  return finish(a)
}

/** A stable: a low boarded range of loose boxes, each with a half door; a horse looks out of one. */
export function stable(look: Look): Art {
  const w = W(look, 14)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.wood, WALL.wood, isLit(look))
  wall(a, x, g - 9, w, 9, WALL.wood)
  spread(x, w, Math.floor(w / 7), 5).forEach((bx, i) => {
    a.rect(bx, g - 7, 5, 3, INK).rect(bx, g - 4, 5, 4, C.gold2).hline(bx, g - 4, 5, C.gold3)
    a.set(bx + 2, g - 2, C.gold1)
    if (i === 1) a.stamp(rows('horse', '.e.', 'eee', '.eT'), bx + 1, g - 7, L)
  })
  slabRoof(a, x - 1, g - 14, w + 2, 5, ROOF.wood, 1)
  // A bale of hay at the end.
  a.rect(x + w, g - 3, 3, 3, C.gold4).hline(x + w, g - 3, 3, C.gold5).hline(x + w, g - 2, 3, C.gold3)
  return finish(a)
}

/** A ranch: a log house with a porch, and a corral in front of it. */
export function ranch(look: Look): Art {
  const w = W(look, 22)
  const { a, g, x } = plot(look, w)
  const L = legend(ROOF.tile, WALL.wood, isLit(look))
  const hw = Math.round(w * 0.6)
  const hy = g - 8
  wall(a, x, hy - 9, hw, 9, WALL.wood)
  for (let j = hy - 7; j < hy - 1; j += 2) a.hline(x, j, hw - 1, C.tan1)
  a.stamp(DOOR.plank, x + 3, hy - 6, L).stamp(WINDOW.framed, x + hw - 7, hy - 7, L)
  slabRoof(a, x - 1, hy - 15, hw + 2, 6, ROOF.tile, 2)
  a.stamp(rows('chimney', 'vvv', 'tus', 'tus', 'tus'), x + hw - 5, hy - 18, L)
  // The corral: rails on three sides, a gate, and a trough.
  rail(a, x, g, w)
  rail(a, x + hw + 1, hy, w - hw - 1)
  a.vline(x + w - 1, hy - 4, 8, C.gold2)
  a.rect(x + hw + 3, g - 7, 5, 2, C.gold1).hline(x + hw + 4, g - 7, 3, C.blue4)
  return finish(a)
}

/** A greenhouse: glass on a white frame, rows of green inside. `Greenhouse2` is a tunnel under grow-lamps. */
export function greenhouse(look: Look): Art {
  const w = W(look, 14)
  const { a, g, x, cx } = plot(look, w)
  const lab = look.kind === 'Greenhouse2'
  if (lab) {
    const r = [7, 8, 9, 10].filter((v) => v * 2 <= w).pop() ?? 7
    dome(a, cx, g - r, r, [C.grey9, C.blue5, C.blue4, C.blue3])
    for (let i = -r + 3; i < r; i += 4) for (let j = 0; j < r; j++) if (a.get(cx + i, g - r + j)) a.set(cx + i, g - r + j, C.grey9)
    for (let i = -r + 2; i <= r - 1; i++) if (a.get(cx + i, g - 3)) a.set(cx + i, g - 3, isLit(look) ? C.plum5 : C.plum4).set(cx + i, g - 2, C.green3).set(cx + i, g - 1, C.green2)
    return finish(a)
  }
  const h = 8
  a.rect(x, g - h, w, h, C.blue4)
  // A glass gable over the glass wall, the frame in white.
  const half = w >> 1
  for (let d = 0; d < half; d++) {
    const top = g - h - Math.ceil(half / 2) + (d >> 1)
    for (let j = top; j < g - h; j++) a.set(cx - d, j, C.blue5).set(cx + 1 + d, j, C.blue4)
    a.set(cx - d, top, C.grey9).set(cx + 1 + d, top, C.grey8)
  }
  for (let i = x; i < x + w; i += 4) a.vline(i, g - h, h, C.grey9)
  a.vline(x + w - 1, g - h, h, C.grey8).hline(x, g - h, w, C.grey9).hline(x, g - 1, w, C.grey8)
  // The plants: a green row along the bench, and three red fruits.
  for (let i = x + 1; i < x + w - 1; i++) if (a.get(i, g - 3) === C.blue4) a.set(i, g - 3, C.green3).set(i, g - 2, C.green2)
  a.set(x + 2, g - 4, C.red4).set(x + 6, g - 4, C.red4).set(x + w - 4, g - 4, C.red4)
  return finish(a)
}

/** A plot of ground with something planted on it in rows: the vineyard, the orchard, the garden. */
function plantedPlot(look: Look, soil: number, draw: (a: Art, x: number, y: number, col: number, row: number) => void, stepX: number, stepY: number): Art {
  const w = look.fw * 8
  const h = look.fh * 8
  const a = new Art(w + 4, h + 6)
  a.rect(2, 4, w, h, soil)
  for (let row = 0, y = 4 + stepY - 1; y <= 4 + h - 1; row++, y += stepY)
    for (let col = 0, x = 3; x + 3 <= w + 1; col++, x += stepX) draw(a, x, y, col, row)
  return a
}

/** A vineyard: vines trained along wires, heavy with purple grapes. */
export function vineyard(look: Look): Art {
  const a = plantedPlot(
    look,
    C.tan2,
    (art, x, y, col) => {
      art.vline(x, y - 4, 5, C.gold1)
      art.rect(x + 1, y - 4, 3, 2, C.green2).hline(x + 1, y - 4, 3, C.green3)
      art.set(x + 1 + (col % 2), y - 2, C.plum2).set(x + 2 + (col % 2), y - 2, C.plum3).set(x + 1 + (col % 2), y - 1, C.plum2)
    },
    4,
    7,
  )
  for (let y = 5; y < a.h - 2; y += 7) a.hline(2, y, a.w - 4, C.tan3)
  return finish(a)
}

/** An orchard: fruit trees in rows on mown grass. */
export function orchard(look: Look): Art {
  const L = legend(ROOF.moss, WALL.wood)
  const a = plantedPlot(
    look,
    C.green3,
    (art, x, y, col, row) => {
      art.stamp(bush, x, y - 5, L).vline(x + 1, y - 1, 2, C.gold1)
      art.set(x + ((col + row) % 2 ? 1 : 2), y - 4, C.red4).set(x + ((col + row) % 2 ? 2 : 1), y - 3, C.red4)
    },
    6,
    8,
  )
  return finish(a)
}

/** A garden: beds of flowers round a path, and a clipped hedge at the back. */
export function garden(look: Look): Art {
  const w = look.fw * 8
  const h = look.fh * 8
  const a = new Art(w + 4, h + 6)
  a.rect(2, 4, w, h, C.green3)
  a.rect(2, 4, w, 2, C.green1).hline(2, 4, w, C.green2)
  // The path: a cross of gravel.
  a.rect(2 + (w >> 1) - 1, 6, 2, h - 2, C.tan4).rect(2, 4 + (h >> 1), w, 2, C.tan4)
  // Four beds, each one colour of flower in a dark-leaved bed.
  const flowers = [C.red4, C.gold5, C.plum4, C.grey9]
  let n = 0
  for (const by of [8, 4 + (h >> 1) + 4])
    for (const bx of [4, 2 + (w >> 1) + 3]) {
      const bw = (w >> 1) - 5
      a.rect(bx, by, bw, 4, C.green2)
      for (let i = 0; i < bw; i += 2) a.set(bx + i, by + 1 + (i % 4 ? 1 : 0), flowers[n % 4])
      n++
    }
  return finish(a)
}

/** A mushroom farm: logs in the shade, pale caps growing along them. */
export function mushroomFarm(look: Look): Art {
  const a = plantedPlot(
    look,
    C.tan1,
    (art, x, y, col) => {
      art.hline(x, y, 5, C.gold1).hline(x, y - 1, 5, C.gold2)
      art.rect(x + (col % 2), y - 3, 2, 2, C.grey9).set(x + (col % 2), y - 3, C.red4).set(x + 3, y - 2, C.tan5)
    },
    7,
    5,
  )
  return finish(a)
}

/** A pen: a fenced yard of trodden earth, a trough and a gate. */
export function pen(look: Look): Art {
  const w = look.fw * 8
  const h = look.fh * 8
  const a = new Art(w + 4, h + 8)
  const g = a.h - 2
  a.rect(2, g - h, w, h, C.tan2)
  a.rect(4, g - h + 3, 3, 2, C.tan3).rect(w - 4, g - 5, 3, 2, C.tan3).rect(8, g - 4, 2, 1, C.tan1)
  rail(a, 2, g - h + 3, w)
  a.vline(2, g - h, h, C.gold2).vline(w + 1, g - h, h, C.gold2)
  rail(a, 2, g, w)
  // The trough, and the gate standing ajar.
  a.rect(w - 5, g - h + 5, 5, 2, C.gold1).hline(w - 4, g - h + 5, 3, C.blue4)
  a.rect(2 + (w >> 1) - 2, g - 4, 4, 4, C.tan2).vline(2 + (w >> 1) + 2, g - 5, 5, C.gold3)
  return finish(a)
}

/** A granary: a round stone store on short posts, to keep the rats out, under a tall cone of thatch. */
export function granary(look: Look): Art {
  const w = W(look, 12) - 4
  const { a, g, cx } = plot(look, w)
  const r = w >> 1
  for (let i = -r + 2; i <= r - 1; i += 3) a.vline(cx + i, g - 2, 2, C.gold1)
  drum(a, cx - r + 1, g - 10, w, 8, WALL.stone)
  a.hline(cx - r + 1, g - 3, w, C.grey5)
  a.rect(cx - 1, g - 8, 3, 4, INK).hline(cx - 1, g - 9, 3, C.gold2)
  cone(a, cx, g - 10 - Math.round(w * 0.7), w + 4, Math.round(w * 0.7), ROOF.straw)
  // A ladder to the hatch.
  a.vline(cx + 3, g - 5, 5, C.gold3)
  return finish(a)
}

/** A market: a paved square with rows of stalls under striped awnings. */
export function market(look: Look): Art {
  const w = look.fw * 8
  const h = look.fh * 8
  const a = new Art(w + 4, h + 10)
  const g = a.h - 2
  const L = legend(ROOF.tile, WALL.stone)
  a.rect(2, g - h, w, h, C.tan4)
  // Paving: joints in a brick bond.
  for (let j = g - h + 2; j < g; j += 3) for (let i = 2 + (((j - g) / 3) & 1 ? 0 : 3); i < w + 2; i += 6) a.set(i, j, C.tan3)
  const awnings: [number, number][] = [
    [C.red4, C.grey9],
    [C.blue3, C.grey9],
    [C.gold4, C.grey9],
    [C.green3, C.grey9],
    [C.plum3, C.grey9],
    [C.red3, C.gold5],
  ]
  const goods = [C.red4, C.gold5, C.green3, C.tan2, C.blue4, C.plum4]
  let n = 0
  for (let y = g - h + 8; y <= g - 1; y += 9)
    for (const sx of spread(2, w, Math.floor(w / 10), 8)) {
      const [c0, c1] = awnings[n % awnings.length]
      for (let i = 0; i < 8; i++) a.set(sx + i, y - 7, i % 2 ? c1 : c0).set(sx + i, y - 6, i % 2 ? C.grey8 : c0)
      a.vline(sx, y - 5, 5, C.gold2).vline(sx + 7, y - 5, 5, C.gold1)
      a.hline(sx + 1, y - 2, 6, C.gold3).hline(sx + 1, y - 1, 6, C.gold2)
      for (let i = 1; i < 7; i += 2) a.set(sx + i, y - 3, goods[(n + i) % goods.length])
      n++
    }
  void L
  return finish(a)
}
