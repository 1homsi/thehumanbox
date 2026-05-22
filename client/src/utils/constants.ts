import type { OrganismState } from '../types'

export function isColorBlind(): boolean {
  return typeof document !== 'undefined' && !!document.body?.classList?.contains('thb-colorblind')
}

const CB_SAFE_BLUE = '#3a86ff'
const CB_SAFE_ORANGE = '#fb8500'
const CB_SAFE_YELLOW = '#ffd166'
const CB_SAFE_FIRE_R = 255
const CB_SAFE_FIRE_G = 215
const CB_SAFE_FIRE_B = 0

export function cbColor(color: string): string {
  if (!isColorBlind()) return color
  const c = color.toLowerCase()
  if (
    c === '#55dd55' ||
    c === '#88ee55' ||
    c === '#bbff44' ||
    c === '#55ff88' ||
    c === '#aaffcc' ||
    c === '#99ff44'
  )
    return CB_SAFE_BLUE
  if (
    c === '#ff6644' ||
    c === '#ff4488' ||
    c === '#ff2200' ||
    c === '#ee7733' ||
    c === '#ffaa44' ||
    c === '#cc8833'
  )
    return CB_SAFE_ORANGE
  if (c === '#f6a64a') return CB_SAFE_ORANGE
  if (c === '#ddbb55') return CB_SAFE_YELLOW
  return color
}

export function cbFireRgba(r: number, g: number, b: number, a: number): string {
  if (isColorBlind()) {
    return `rgba(${CB_SAFE_FIRE_R},${CB_SAFE_FIRE_G},${CB_SAFE_FIRE_B},${a})`
  }
  return `rgba(${r},${g},${b},${a})`
}

export function lineageColor(lineageId: string | null | undefined): string {
  if (!lineageId || typeof lineageId !== 'string') return 'hsl(0, 0%, 55%)'

  let h = 0
  for (const c of lineageId) h = Math.imul(h * 31 + c.charCodeAt(0), 1) >>> 0

  const colorBlind = isColorBlind()

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

export function lineageWord(orgs: OrganismState[], concept: string): string {
  const counts: Record<string, number> = {}
  for (const org of orgs) {
    const w = org.vocabulary?.[concept]
    if (w) counts[w] = (counts[w] ?? 0) + 1
  }
  const entries = Object.entries(counts)
  if (!entries.length) return ''
  return entries.sort((a, b) => b[1] - a[1])[0][0]
}

export const EVENT_ICONS: Record<string, string> = {
  born: '+',
  died: '×',
  signal: '→',
  alarm: '!',
  challenge: '⚔',
  gift: '♥',
  treaty: '=',
  dawn: '☀',
  dusk: '☽',
  season: '~',
  drought: '▽',
  outbreak: '☣',
  build: '⌂',
  mourn: '☾',
  teach: '✦',
  social: '~',
  hunt: '✦',
  era: '◈',
}

export const EVENT_COLORS: Record<string, string> = {
  born: '#55dd55',
  died: '#888',
  signal: '#ffdd88',
  alarm: '#ff4488',
  challenge: '#ff2200',
  gift: '#55ff88',
  treaty: '#88aaff',
  dawn: '#ffeeaa',
  dusk: '#8888cc',
  season: '#aaddff',
  drought: '#cc8833',
  outbreak: '#99ff44',
  build: '#c8a050',
  mourn: '#9988bb',
  teach: '#88ddff',
  social: '#aaffcc',
  hunt: '#ffaa44',
  era: '#ccaaff',
}

export const HIDDEN_EVENT_TYPES = new Set(['dawn', 'dusk', 'season'])
