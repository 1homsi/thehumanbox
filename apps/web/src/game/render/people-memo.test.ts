import { afterEach, describe, expect, it } from 'vitest'
import { lineageColor } from '../../shared/constants'
import { useUIStore } from '../../state/store'
import { orgVariant } from '../model/org-variant'
import { drawEmote, emoteFor, type Emote } from './activity-emotes'
import { workActivity } from './activity-visuals'
import { deterministicAppearanceIndex, HUMAN_APPEARANCES } from './character-visuals'
import { orgAnimPhase } from './draw-helpers'

// Everything below was recomputed per person on every frame; it is now cached per id or
// thought. These reference copies are the previous implementations, verbatim.

function refOrgVariant(id: string) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const a = (h >>> 0) / 0xffffffff
  const b = ((h ^ 0x9e3779b9) >>> 0) / 0xffffffff
  const c = ((h ^ 0x85ebca6b) >>> 0) / 0xffffffff
  const accents = ['#d4a843', '#e08070', '#7ab0e0', '#9070b0', '#7ebd6a', '#e0c070', '#c08060']
  const hairs = ['#1a1310', '#3a2618', '#5a3a20', '#7a5028', '#a86838', '#cc9844', '#dcdcdc']
  return {
    hueShift: (a - 0.5) * 36,
    accent: accents[Math.floor(b * accents.length)],
    bodyRadius: 4.6 + c * 1.0,
    hairColor: hairs[Math.floor(c * hairs.length)],
  }
}

function refAnimPhase(id: string) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h % 800
}

function refAppearance(id: string) {
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % HUMAN_APPEARANCES
}

function refLineageColor(lineageId: string, colorBlind: boolean) {
  let h = 0
  for (const c of lineageId) h = Math.imul(h * 31 + c.charCodeAt(0), 1) >>> 0
  let hue: number
  if (colorBlind) {
    const bin = h % 2
    const jitter = ((h >>> 4) % 30) - 15
    hue = bin === 0 ? 210 + jitter : 30 + jitter
  } else {
    hue = (h * 137.508) % 360
  }
  const sat = [90, 72, 60][(h >>> 8) % 3]
  const lit = [78, 70, 62][(h >>> 16) % 3]
  return `hsl(${hue.toFixed(0)}, ${sat}%, ${lit}%)`
}

const EMOTE_RULES: Array<[string, RegExp]> = [
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

function refEmote(org: {
  thought?: string | null
  fear_level?: number
  infection?: number
  grief_ticks?: number
  joy_ticks?: number
}) {
  const t = (org.thought ?? '').toLowerCase()
  for (const [emote, pattern] of EMOTE_RULES) {
    if (pattern.test(t)) return emote
  }
  if ((org.fear_level ?? 0) > 0.7) return 'fear'
  if ((org.infection ?? 0) > 0.4) return 'sick'
  if ((org.grief_ticks ?? 0) > 40) return 'grief'
  if ((org.joy_ticks ?? 0) > 400) return 'joy'
  return null
}

function refWorkActivity(thought: string, moving: boolean) {
  if (moving) return null
  const t = thought.toLowerCase()
  if (/\b(seeking|looking|searching|heading|walking|traveling|going|planning|wanting)\b/.test(t)) return null
  if (/repairing|rebuilding|reclaiming|building|constructing|raising/.test(t)) return 'build'
  if (/chopping|cutting wood|gathering wood|felling/.test(t)) return 'chop'
  if (/mining|quarrying|gathering stone|digging ore/.test(t)) return 'mine'
  if (/harvesting|planting|sowing|irrigating|tending crops/.test(t)) return 'farm'
  if (/fishing/.test(t)) return 'fish'
  if (/foraging|gathering|picking berries/.test(t)) return 'gather'
  if (/sleeping|resting|dozing|napping/.test(t)) return 'rest'
  return null
}

const THOUGHTS = [
  '',
  'wandering',
  'resting under shelter',
  'Resting Under Shelter',
  'chopping wood',
  'quarrying stone',
  'heading to the quarry',
  'building shelter',
  'repairing the granary',
  'fishing at the lake',
  'foraging for berries',
  'harvesting wheat',
  'walking with partner',
  'calling for warriors',
  'praying at the shrine',
  'trading salt',
  'teaching the children',
  'dancing at the festival',
  'inspired by a dream',
  'fleeing the wolves',
  'mourning the dead',
  'sick with fever',
  '"help"',
  'constructor',
  '__proto__',
]

function ids(n: number) {
  return Array.from({ length: n }, (_, i) => `org-${(i * 2654435761) >>> 0}-${i % 7}`)
}

afterEach(() => {
  useUIStore.setState((s) => ({ viewFlags: { ...s.viewFlags, colorBlind: false } }))
})

describe('per-person values cached across frames', () => {
  it('orgVariant equals the original computation and is reused', () => {
    for (const id of ids(300)) {
      const first = orgVariant(id)
      expect(first).toEqual(refOrgVariant(id))
      expect(orgVariant(id)).toBe(first)
    }
  })

  it('animation phase and appearance index equal the originals', () => {
    for (const id of ids(300)) {
      expect(orgAnimPhase(id)).toBe(refAnimPhase(id))
      expect(orgAnimPhase(id)).toBe(refAnimPhase(id))
      expect(deterministicAppearanceIndex(id)).toBe(refAppearance(id))
      expect(deterministicAppearanceIndex(id)).toBe(refAppearance(id))
    }
  })

  it('lineage colour follows the colour-blind palette flag and equals the original', () => {
    const lineages = ids(200)
    for (const colorBlind of [false, true, false, true]) {
      useUIStore.setState((s) => ({ viewFlags: { ...s.viewFlags, colorBlind } }))
      for (const id of lineages) expect(lineageColor(id)).toBe(refLineageColor(id, colorBlind))
    }
    expect(lineageColor(null)).toBe('hsl(0, 0%, 55%)')
    expect(lineageColor('')).toBe('hsl(0, 0%, 55%)')
  })

  it('emotes equal the original rule chain, including the state fallbacks', () => {
    const states = [
      {},
      { fear_level: 0.9 },
      { infection: 0.5 },
      { grief_ticks: 60 },
      { joy_ticks: 500 },
      { fear_level: 0.9, infection: 0.5, grief_ticks: 60, joy_ticks: 500 },
      { fear_level: 0.2, joy_ticks: 100 },
    ]
    for (const round of [0, 1]) {
      for (const thought of [...THOUGHTS, null, undefined]) {
        for (const state of states) {
          const org = { thought, ...state }
          expect(emoteFor(org), `${String(thought)} ${JSON.stringify(state)} round ${round}`).toBe(
            refEmote(org),
          )
        }
      }
    }
  })

  it('work poses equal the original rule chain, moving or not', () => {
    for (const round of [0, 1]) {
      for (const thought of THOUGHTS) {
        for (const moving of [false, true]) {
          expect(workActivity(thought, moving), `${thought} ${moving} round ${round}`).toBe(
            refWorkActivity(thought, moving),
          )
        }
      }
    }
  })

  it('draws emotes as the same rects in the same colours and order as before', () => {
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
    // The previous drawEmote, verbatim, as the reference.
    const record = () => {
      const out: string[] = []
      let style = ''
      const ctx = {
        set fillStyle(v: string) {
          style = v
        },
        get fillStyle() {
          return style
        },
        fillRect: (x: number, y: number, w: number, h: number) => out.push(`${style}|${x},${y},${w},${h}`),
      }
      return { ctx: ctx as unknown as CanvasRenderingContext2D, out }
    }
    const emotes: Emote[] = [
      'fight',
      'fear',
      'sick',
      'grief',
      'love',
      'pray',
      'trade',
      'teach',
      'party',
      'idea',
      'joy',
    ]
    const art: Record<string, string[]> = {
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
    const refDraw = (
      ctx: CanvasRenderingContext2D,
      emote: Emote,
      x: number,
      y: number,
      time: number,
      phase: number,
    ) => {
      const rows = art[emote]
      const bob = Math.round(Math.sin(time / 420 + phase) * 1.2)
      const size = rows.length
      const x0 = Math.round(x - size / 2) - 1
      const y0 = Math.round(y - size - 2) + bob
      ctx.fillStyle = 'rgba(26,19,13,0.82)'
      ctx.fillRect(x0 - 1, y0 - 1, size + 4, size + 4)
      ctx.fillRect(x0 + 1, y0 + size + 3, 2, 1)
      for (let r = 0; r < size; r++) {
        const row = rows[r]
        for (let c = 0; c < row.length; c++) {
          const color = COLORS[row[c]]
          if (!color) continue
          ctx.fillStyle = color
          ctx.fillRect(x0 + 1 + c, y0 + 1 + r, 1, 1)
        }
      }
    }
    for (const emote of emotes) {
      for (const [x, y, time, phase] of [
        [100.4, 80.6, 1234, 17],
        [0, 0, 0, 0],
        [55.5, 31.2, 999999, 413],
      ]) {
        const a = record()
        const b = record()
        drawEmote(a.ctx, emote, x, y, time, phase)
        refDraw(b.ctx, emote, x, y, time, phase)
        expect(a.out, emote).toEqual(b.out)
        expect((a.ctx as unknown as { fillStyle: string }).fillStyle).toBe(
          (b.ctx as unknown as { fillStyle: string }).fillStyle,
        )
      }
    }
  })
})
