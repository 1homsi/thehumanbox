import type { OrganismState } from '../types'

export function lineageColor(lineageId: string | null | undefined): string {
  if (!lineageId || typeof lineageId !== 'string') return 'hsl(0, 0%, 55%)'

  let h = 0
  for (const c of lineageId) h = Math.imul(h * 31 + c.charCodeAt(0), 1) >>> 0

  const colorBlind = typeof document !== 'undefined'
    && document.body?.classList?.contains('thb-colorblind')

  let hue: number
  if (colorBlind) {
    const raw = (h * 137.508) % 220
    hue = raw < 50 ? raw + 40
        : raw < 110 ? raw + 110
        :             raw + 130
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
  born: '+', died: '×', signal: '→', alarm: '!',
  challenge: '⚔', gift: '♥', treaty: '=',
  dawn: '☀', dusk: '☽', season: '~',
  drought: '▽', outbreak: '☣', build: '⌂',
  mourn: '☾', teach: '✦', social: '~', hunt: '✦', era: '◈',
}

export const EVENT_COLORS: Record<string, string> = {
  born: '#55dd55', died: '#888', signal: '#ffdd88', alarm: '#ff4488',
  challenge: '#ff2200', gift: '#55ff88', treaty: '#88aaff',
  dawn: '#ffeeaa', dusk: '#8888cc', season: '#aaddff',
  drought: '#cc8833', outbreak: '#99ff44', build: '#c8a050',
  mourn: '#9988bb', teach: '#88ddff', social: '#aaffcc', hunt: '#ffaa44', era: '#ccaaff',
}

export const HIDDEN_EVENT_TYPES = new Set(['dawn', 'dusk', 'season'])
