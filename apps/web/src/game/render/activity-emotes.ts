/**
 * Small pixel emotes over people's heads, so a glance at a village shows what
 * someone is in the middle of. Derived from the current thought and a few state
 * fields the client already has; the strongest feeling wins. A settled good mood
 * is not an emote: it is how most people are most of the time, and a smiley over
 * every head in a calm town said nothing and covered the people.
 */
export type Emote =
  'fight' | 'fear' | 'sick' | 'grief' | 'love' | 'pray' | 'trade' | 'teach' | 'party' | 'idea'

interface EmoteSource {
  thought?: string | null
  fear_level?: number
  infection?: number
  grief_ticks?: number
}

const RULES: Array<[Emote, RegExp]> = [
  ['fight', /\b(fight|fought|attack|raid|war|battle|challeng|duel|defend|mauled)/],
  ['fear', /\b(flee|fleeing|avoiding danger|afraid|panic|hiding|attacks)/],
  ['sick', /\b(sick|fever|ill|infect|plague|cough)/],
  ['grief', /\b(mourn|griev|bury|burial|lost)/],
  ['love', /\b(partner|court|flirt|romance|love|kiss|drawn to someone|wed)/],
  ['pray', /\b(pray|worship|ritual|shrine|temple|blessed|meditat)/],
  ['trade', /\b(trad|barter|market|sell|buy|merchant)/],
  ['teach', /\b(teach|learn|mentor|lesson|study|read)/],
  ['party', /\b(feast|celebrat|danc|sing|music|festival|drum)/],
  ['idea', /\b(inspired|discover|invent|idea|experiment)/],
]

// People think one of a few hundred distinct thoughts, so which rule a thought matches
// is worked out once per thought instead of running ten regexes per person per frame.
const thoughtEmotes = new Map<string, Emote | null>()
function emoteForThought(thought: string): Emote | null {
  const cached = thoughtEmotes.get(thought)
  if (cached !== undefined) return cached
  const t = thought.toLowerCase()
  let found: Emote | null = null
  for (const [emote, pattern] of RULES) {
    if (pattern.test(t)) {
      found = emote
      break
    }
  }
  if (thoughtEmotes.size >= 5000) thoughtEmotes.clear()
  thoughtEmotes.set(thought, found)
  return found
}

export function emoteFor(org: EmoteSource): Emote | null {
  const byThought = emoteForThought(org.thought ?? '')
  if (byThought) return byThought
  if ((org.fear_level ?? 0) > 0.7) return 'fear'
  if ((org.infection ?? 0) > 0.4) return 'sick'
  if ((org.grief_ticks ?? 0) > 40) return 'grief'
  return null
}

const COLORS: Record<string, string> = {
  r: '#e2574c',
  R: '#a8322a',
  y: '#f3d17a',
  Y: '#c9973f',
  w: '#f6f1e4',
  g: '#8fd06a',
  G: '#4e8a3a',
  b: '#7cc8ff',
  B: '#3b7fb8',
  k: '#2b2117',
  p: '#b25fc0',
  s: '#7d8590',
}

/** The warm ink every sprite on the map is outlined in. */
const INK = '#2b2117'

const ICONS: Record<Emote, string[]> = {
  fight: ['s.....s', '.s...s.', '..s.s..', '...s...', '..s.s..', '.Y...Y.', 'Y.....Y'],
  fear: ['...r...', '...r...', '...r...', '...r...', '...r...', '.......', '...r...'],
  sick: ['...g...', '..ggg..', '.gggGg.', '.ggGgg.', '.gggGg.', '..ggg..', '.......'],
  grief: ['...b...', '..bbb..', '.bbbbb.', '.bbbbb.', '.bbBbb.', '..bbb..', '.......'],
  love: ['.rr.rr.', 'rrrrrrr', 'rwrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'],
  pray: ['...Y...', '.Y.Y.Y.', '..YyY..', 'YYyyyYY', '..YyY..', '.Y.Y.Y.', '...Y...'],
  trade: ['..yyy..', '.yYYYy.', 'yYyyyYy', 'yYyyyYy', 'yYyyyYy', '.yYYYy.', '..yyy..'],
  teach: ['.......', 'bbb.bbb', 'bwb.bwb', 'bwbBbwb', 'bwbBbwb', 'bbbBbbb', '...B...'],
  party: ['....pp.', '....p.p', '....p..', '....p..', '.ppp...', 'pppp...', '.pp....'],
  idea: ['..YYY..', '.YyyyY.', '.YywyY.', '.YyyyY.', '..YyY..', '..sss..', '...s...'],
}

/** Every emote, in a stable order. */
export const EMOTES = Object.keys(ICONS) as Emote[]

interface EmotePixels {
  size: number
  /** Column, row and colour of every painted pixel, in the row-major order they are drawn. */
  cols: Uint8Array
  rowIdx: Uint8Array
  colors: string[]
  /** Column and row of every ink pixel around the icon, one cell outside it (so -1..size). */
  inkCols: Int8Array
  inkRows: Int8Array
}

const emotePixels = new Map<Emote, EmotePixels>()
function pixelsFor(emote: Emote): EmotePixels {
  let px = emotePixels.get(emote)
  if (px) return px
  const rows = ICONS[emote]
  const cols: number[] = []
  const rowIdx: number[] = []
  const colors: string[] = []
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    for (let c = 0; c < row.length; c++) {
      const color = COLORS[row[c]]
      if (!color) continue
      cols.push(c)
      rowIdx.push(r)
      colors.push(color)
    }
  }
  // The ink: every empty cell next to a painted one, left, right, above or below.
  const painted = (c: number, r: number) => !!COLORS[rows[r]?.[c] ?? '.']
  const inkCols: number[] = []
  const inkRows: number[] = []
  for (let r = -1; r <= rows.length; r++) {
    for (let c = -1; c <= rows.length; c++) {
      if (painted(c, r)) continue
      if (painted(c - 1, r) || painted(c + 1, r) || painted(c, r - 1) || painted(c, r + 1)) {
        inkCols.push(c)
        inkRows.push(r)
      }
    }
  }
  px = {
    size: rows.length,
    cols: Uint8Array.from(cols),
    rowIdx: Uint8Array.from(rowIdx),
    colors,
    inkCols: Int8Array.from(inkCols),
    inkRows: Int8Array.from(inkRows),
  }
  emotePixels.set(emote, px)
  return px
}

/**
 * Draws `emote` with its bottom at (x, y): the icon itself, outlined in ink, with no box behind it. A
 * parchment bubble as wide as a person, over every head, read as a sticker and hid the people under it.
 */
export function drawEmote(
  ctx: CanvasRenderingContext2D,
  emote: Emote,
  x: number,
  y: number,
  time: number,
  phase: number,
) {
  // The pixel lists are flattened once per emote, and the fill colour is only set when it
  // changes along the same draw order (the ink first, then the icon row by row).
  const { size, cols, rowIdx, colors, inkCols, inkRows } = pixelsFor(emote)
  const bob = Math.round(Math.sin(time / 420 + phase) * 1.2)
  const x0 = Math.round(x - size / 2)
  const y0 = Math.round(y - size - 1) + bob
  ctx.fillStyle = INK
  for (let i = 0; i < inkCols.length; i++) ctx.fillRect(x0 + inkCols[i], y0 + inkRows[i], 1, 1)
  let last = INK
  for (let i = 0; i < colors.length; i++) {
    const color = colors[i]
    if (color !== last) {
      ctx.fillStyle = color
      last = color
    }
    ctx.fillRect(x0 + cols[i], y0 + rowIdx[i], 1, 1)
  }
}
