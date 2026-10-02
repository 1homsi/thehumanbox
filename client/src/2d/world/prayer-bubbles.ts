// A small pixel speech bubble over a praying tribe, with a glyph for what
// they need. It bobs gently, and its outline turns red and blinks when the
// prayer is about to lapse.

type Ctx = CanvasRenderingContext2D

function px(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c
  ctx.fillRect(Math.round(x), Math.round(y), w, h)
}

// 7×7 glyphs; each row is a string, '.' is empty.
const GLYPHS: Record<string, { rows: string[]; colors: Record<string, string> }> = {
  hunger: {
    rows: ['...g...', '..g....', '.rrrrr.', 'rrrRrrr', 'rrrrrrr', 'rrrrrrr', '.rrrrr.'],
    colors: { g: '#5f9440', r: '#d6453a', R: '#f4a08a' },
  },
  thirst: {
    rows: ['...b...', '..bbb..', '..bbb..', '.bbBbb.', '.bbbbb.', '.bbbbb.', '..bbb..'],
    colors: { b: '#3d8fd1', B: '#a9dcff' },
  },
  sickness: {
    rows: ['..rrr..', '..rrr..', 'rrrrrrr', 'rrrrrrr', 'rrrrrrr', '..rrr..', '..rrr..'],
    colors: { r: '#cf3b33' },
  },
  danger: {
    rows: ['...r...', '..rrr..', '..rrr..', '..rrr..', '...r...', '.......', '...r...'],
    colors: { r: '#cf3b33' },
  },
  rain: {
    rows: ['..www..', '.wwwww.', 'wwwwwww', '.......', '.b.b.b.', 'b.b.b..', '.......'],
    colors: { w: '#8f9aa6', b: '#3d8fd1' },
  },
  children: {
    rows: ['.......', '.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'],
    colors: { r: '#e0566b' },
  },
  peace: {
    rows: ['.......', '..ww...', '.wwwww.', 'wwwwwww', '..wwwk.', '...w...', '.......'],
    colors: { w: '#9aa8b4', k: '#f0b54a' },
  },
  shelter: {
    rows: ['...r...', '..rrr..', '.rrrrr.', 'rrrrrrr', '.wwdww.', '.wwdww.', '.wwdww.'],
    colors: { r: '#b5532f', w: '#d8c29c', d: '#5a3a22' },
  },
  knowledge: {
    rows: ['..yyy..', '.yyyyy.', '.yyYyy.', '.yyyyy.', '..yyy..', '..sss..', '..sss..'],
    colors: { y: '#f2c64a', Y: '#fff1b0', s: '#8a8f96' },
  },
}

/** Draw a bubble whose tail points at (x, y) in world pixels. */
export function drawPrayerBubble(
  ctx: Ctx,
  x: number,
  y: number,
  kind: string,
  timeLeft: number,
  t: number,
  phase = x,
  count = 1,
) {
  const bob = Math.round(Math.sin(t * 0.004 + phase * 0.05) * 1.5)
  const w = 13
  const h = 11
  const left = Math.round(x - w / 2)
  const top = Math.round(y - h - 6 + bob)
  const urgent = timeLeft < 0.25
  const blink = urgent && Math.floor(t / 400) % 2 === 0
  const ink = urgent ? (blink ? '#ff5a4a' : '#b0322a') : '#2a201a'

  ctx.save()
  // Shadow, body, outline with clipped corners.
  px(ctx, left + 1, top + h, w - 1, 1, 'rgba(0,0,0,0.25)')
  px(ctx, left + 1, top, w - 2, h, '#fbf6e8')
  px(ctx, left, top + 1, w, h - 2, '#fbf6e8')
  px(ctx, left + 1, top - 1, w - 2, 1, ink)
  px(ctx, left + 1, top + h, w - 2, 1, ink)
  px(ctx, left - 1, top + 1, 1, h - 2, ink)
  px(ctx, left + w, top + 1, 1, h - 2, ink)
  px(ctx, left, top, 1, 1, ink)
  px(ctx, left + w - 1, top, 1, 1, ink)
  px(ctx, left, top + h - 1, 1, 1, ink)
  px(ctx, left + w - 1, top + h - 1, 1, 1, ink)
  // Tail toward the tribe.
  const tx = Math.round(x) - 1
  px(ctx, tx, top + h, 3, 1, '#fbf6e8')
  px(ctx, tx + 1, top + h + 1, 2, 1, '#fbf6e8')
  px(ctx, tx - 1, top + h, 1, 1, ink)
  px(ctx, tx, top + h + 1, 1, 1, ink)
  px(ctx, tx + 1, top + h + 2, 1, 1, ink)
  px(ctx, tx + 3, top + h, 1, 1, ink)
  px(ctx, tx + 2, top + h + 1, 1, 1, ink)

  const glyph = GLYPHS[kind] ?? GLYPHS.danger!
  const gx = left + 3
  const gy = top + 2
  glyph.rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const color = glyph.colors[row[c]!]
      if (color) px(ctx, gx + c, gy + r, 1, 1, color)
    }
  })
  // Time left as a thin bar under the glyph.
  const bar = Math.max(1, Math.round((w - 4) * timeLeft))
  px(ctx, left + 2, top + h - 1, w - 4, 1, 'rgba(0,0,0,0.12)')
  px(ctx, left + 2, top + h - 1, bar, 1, urgent ? '#d0453a' : '#c9a043')
  if (count > 1) {
    // A small count badge on the corner for merged bubbles.
    const label = count > 9 ? '9+' : String(count)
    const bw = label.length * 4 + 3
    const bx = left + w - 2
    const by = top - 4
    px(ctx, bx, by, bw, 7, '#2a201a')
    px(ctx, bx + 1, by + 1, bw - 2, 5, '#c9a043')
    drawDigits(ctx, label, bx + 2, by + 1)
  }
  ctx.restore()
}

// 3×5 digits so the badge stays crisp pixel art at any zoom.
const DIGITS: Record<string, string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '..#', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  '+': ['...', '.#.', '###', '.#.', '...'],
}

function drawDigits(ctx: Ctx, label: string, x: number, y: number) {
  ;[...label].forEach((ch, i) => {
    const rows = DIGITS[ch]
    if (!rows) return
    rows.forEach((row, r) => {
      for (let c = 0; c < 3; c++) if (row[c] === '#') px(ctx, x + i * 4 + c, y + r, 1, 1, '#2a201a')
    })
  })
}

export interface BubbleSpot<T> {
  prayer: T
  x: number
  y: number
  /** Share of time left; the most urgent prayer speaks for a merged group. */
  left: number
}

/** Merge bubbles closer than `spacing` world pixels into one with a count. */
export function mergePrayerBubbles<T>(spots: BubbleSpot<T>[], spacing: number) {
  const out: (BubbleSpot<T> & { count: number })[] = []
  for (const spot of [...spots].sort((a, b) => a.left - b.left)) {
    const near = out.find((o) => Math.abs(o.x - spot.x) < spacing && Math.abs(o.y - spot.y) < spacing)
    if (near) near.count += 1
    else out.push({ ...spot, count: 1 })
  }
  return out
}

/** World-pixel scale of bubbles at a camera zoom (matches the draw). */
export function prayerBubbleScale(zoom: number): number {
  return Math.max(1, 1.6 / Math.max(0.05, zoom))
}

/**
 * The prayer whose bubble covers a point in map pixels, if any. Uses the
 * same anchor and box as `drawPrayerBubble`, padded a little for fingers.
 */
export function prayerAtPoint<T extends { x: number; y: number }>(
  prayers: readonly T[],
  px: number,
  py: number,
  origin: { x: number; y: number },
  tile: number,
  zoom: number,
): T | null {
  const s = prayerBubbleScale(zoom)
  let best: T | null = null
  let bestD = Infinity
  for (const p of prayers) {
    const ax = (p.x - origin.x) * tile + tile / 2
    const ay = (p.y - origin.y) * tile - 8
    const lx = (px - ax) / s
    const ly = (py - ay) / s
    if (lx < -10 || lx > 10 || ly < -20 || ly > 0) continue
    const d = Math.hypot(lx, ly + 11)
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}
