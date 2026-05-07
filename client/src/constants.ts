import type { OrganismState } from './types'

// ── Visual helpers ────────────────────────────────────────────────────────

export function lineageColor(lineageId: string): string {
  let h = 0
  for (const c of lineageId) h = Math.imul(h * 31 + c.charCodeAt(0), 1) >>> 0

  // Golden-angle hue spread — maximally separates adjacent lineages in hue space
  const hue = (h * 137.508) % 360

  // Vary saturation and lightness independently using different hash bits
  // Three saturation bands: vivid (90%), standard (72%), muted (55%)
  const sat = [90, 72, 55][(h >> 8) % 3]
  // Three lightness bands: light (72%), mid (58%), deep (44%)
  const lit = [72, 58, 44][(h >> 16) % 3]

  return `hsl(${hue.toFixed(0)}, ${sat}%, ${lit}%)`
}

// Dominant vocabulary word shared by a lineage — their word for "home"
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

// ── Event display ─────────────────────────────────────────────────────────

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

// Event types hidden from the main event log (too noisy)
export const HIDDEN_EVENT_TYPES = new Set(['dawn', 'dusk', 'season'])
