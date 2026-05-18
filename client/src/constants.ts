import type { OrganismState } from './types'

// ── Visual helpers ────────────────────────────────────────────────────────

export function lineageColor(lineageId: string | null | undefined): string {
  // Defensive: a freshly-born organism can briefly exist in the cache before
  // its cold fields (lineage_id) arrive on the next full snapshot. Render in
  // a neutral grey so the UI doesn't crash.
  if (!lineageId || typeof lineageId !== 'string') return 'hsl(0, 0%, 55%)'

  let h = 0
  for (const c of lineageId) h = Math.imul(h * 31 + c.charCodeAt(0), 1) >>> 0

  // Golden-angle hue spread - maximally separates adjacent lineages in hue space
  const hue = (h * 137.508) % 360

  // Vary saturation and lightness independently using different hash bits
  // Three saturation bands: vivid (90%), standard (72%), muted (60%)
  const sat = [90, 72, 60][(h >>> 8) % 3]
  // Three lightness bands: light (78%), mid (70%), deep (62%) - tuned for
  // contrast over the brown panel backgrounds (#28201a, #3f2f23) used as
  // the app theme. The previous floor of 52% washed out into the brown
  // tint, especially for hues around 30° (literally brown). 62% gives
  // enough luminance to read against any panel surface in the app
  // while keeping the visual differentiation between lineages.
  const lit = [78, 70, 62][(h >>> 16) % 3]

  return `hsl(${hue.toFixed(0)}, ${sat}%, ${lit}%)`
}

// Dominant vocabulary word shared by a lineage - their word for "home"
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
