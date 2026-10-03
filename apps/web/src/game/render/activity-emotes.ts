/**
 * Small pixel emotes over people's heads, so a glance at a village shows what
 * everyone is up to. Derived from the current thought and a few state fields
 * the client already has; the strongest feeling wins.
 */
export type Emote =
  'fight' | 'fear' | 'sick' | 'grief' | 'love' | 'pray' | 'trade' | 'teach' | 'party' | 'idea' | 'joy'

interface EmoteSource {
  thought?: string | null
  fear_level?: number
  infection?: number
  grief_ticks?: number
  joy_ticks?: number
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
  if ((org.joy_ticks ?? 0) > 400) return 'joy'
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
  k: '#2a1f16',
  p: '#d68be0',
}

const ICONS: Record<Emote, string[]> = {
  fight: ['w.....w', '.w...w.', '..w.w..', '...w...', '..w.w..', '.Y...Y.', 'Y.....Y'],
  fear: ['...r...', '...r...', '...r...', '...r...', '...r...', '.......', '...r...'],
  sick: ['...g...', '..ggg..', '.gggGg.', '.ggGgg.', '.gggGg.', '..ggg..', '.......'],
  grief: ['...b...', '..bbb..', '.bbbbb.', '.bbbbb.', '.bbBbb.', '..bbb..', '.......'],
  love: ['.rr.rr.', 'rrrrrrr', 'rwrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'],
  pray: ['...y...', '.y.y.y.', '..yyy..', 'yyywyyy', '..yyy..', '.y.y.y.', '...y...'],
  trade: ['..yyy..', '.yYYYy.', 'yYyyyYy', 'yYyyyYy', 'yYyyyYy', '.yYYYy.', '..yyy..'],
  teach: ['.......', 'bbb.bbb', 'bwb.bwb', 'bwbBbwb', 'bwbBbwb', 'bbbBbbb', '...B...'],
  party: ['....pp.', '....p.p', '....p..', '....p..', '.ppp...', 'pppp...', '.pp....'],
  idea: ['..yyy..', '.yywyy.', '.ywyyy.', '.yyyyy.', '..yyy..', '..YYY..', '...Y...'],
  joy: ['.......', 'y.....y', '.......', '.y...y.', '..yyy..', '.......', '.......'],
}

interface EmotePixels {
  size: number
  /** Column, row and colour of every painted pixel, in the row-major order they are drawn. */
  cols: Uint8Array
  rowIdx: Uint8Array
  colors: string[]
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
  px = { size: rows.length, cols: Uint8Array.from(cols), rowIdx: Uint8Array.from(rowIdx), colors }
  emotePixels.set(emote, px)
  return px
}

/** Draws `emote` in a small bubble whose bottom sits at (x, y). */
export function drawEmote(
  ctx: CanvasRenderingContext2D,
  emote: Emote,
  x: number,
  y: number,
  time: number,
  phase: number,
) {
  // The pixel list is flattened once per emote, and the fill colour is only set when it
  // changes along the same draw order (the bubble first, then the pixels row by row).
  const { size, cols, rowIdx, colors } = pixelsFor(emote)
  const bob = Math.round(Math.sin(time / 420 + phase) * 1.2)
  const x0 = Math.round(x - size / 2) - 1
  const y0 = Math.round(y - size - 2) + bob
  ctx.fillStyle = 'rgba(26,19,13,0.82)'
  ctx.fillRect(x0 - 1, y0 - 1, size + 4, size + 4)
  ctx.fillRect(x0 + 1, y0 + size + 3, 2, 1)
  let last = ''
  for (let i = 0; i < colors.length; i++) {
    const color = colors[i]
    if (color !== last) {
      ctx.fillStyle = color
      last = color
    }
    ctx.fillRect(x0 + 1 + cols[i], y0 + 1 + rowIdx[i], 1, 1)
  }
}
