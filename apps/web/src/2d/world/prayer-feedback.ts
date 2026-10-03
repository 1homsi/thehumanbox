// When a prayer disappears, show what happened on the map: a golden glow
// and "thank you" when it was answered, a grey sigh when it lapsed.
import type { FaithInfo, PrayerInfo } from '../../types'

interface Effect {
  x: number
  y: number
  lineage: string
  answered: boolean
  start: number
}

const LIFE_MS = 1800
/** How long a tribe dances after its prayer is answered. */
const CELEBRATE_MS = 5000
let previous = new Map<number, PrayerInfo>()
let effects: Effect[] = []

/** Compare this frame's prayers with the last frame's and queue effects. */
export function updatePrayerFeedback(
  prayers: readonly PrayerInfo[] | undefined,
  faith: FaithInfo | undefined,
  now: number,
) {
  const current = new Map((prayers ?? []).map((p) => [p.id, p]))
  if (faith) {
    const blessed = new Set(faith.blessed)
    const despairing = new Set(faith.despairing)
    for (const [id, p] of previous) {
      if (current.has(id)) continue
      if (blessed.has(p.lineage_id))
        effects.push({ x: p.x, y: p.y, lineage: p.lineage_id, answered: true, start: now })
      else if (despairing.has(p.lineage_id))
        effects.push({ x: p.x, y: p.y, lineage: p.lineage_id, answered: false, start: now })
    }
  }
  previous = current
  effects = effects.filter((e) => now - e.start < (e.answered ? CELEBRATE_MS : LIFE_MS)).slice(-24)
}

export function prayerEffectsActive(): boolean {
  return effects.length > 0
}

/** True when a person of `lineage` at (x, y) is near a prayer just answered. */
export function celebrating(lineage: string, x: number, y: number, now: number): boolean {
  for (const e of effects) {
    if (
      e.answered &&
      e.lineage === lineage &&
      now - e.start < CELEBRATE_MS &&
      Math.hypot(e.x - x, e.y - y) <= 12
    )
      return true
  }
  return false
}

/** For tests: forget everything seen so far. */
export function resetPrayerFeedback() {
  previous = new Map()
  effects = []
}

export function activePrayerEffects(): readonly Effect[] {
  return effects
}

/** Draw queued effects; `toPx` maps a tile to world pixels. */
export function drawPrayerFeedback(
  ctx: CanvasRenderingContext2D,
  toPx: (x: number, y: number) => [number, number],
  scale: number,
  now: number,
) {
  for (const e of effects) {
    if (now - e.start >= LIFE_MS) continue
    const t = Math.min(1, (now - e.start) / LIFE_MS)
    const [px, py] = toPx(e.x, e.y)
    ctx.save()
    ctx.translate(Math.round(px), Math.round(py))
    ctx.scale(scale, scale)
    ctx.globalAlpha = 1 - t * t
    if (e.answered) {
      // A ring of light swelling outwards, sparks rising, and thanks.
      const r = 4 + t * 14
      ctx.strokeStyle = '#f7d774'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(0, -4, r, 0, Math.PI * 2)
      ctx.stroke()
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + t * 2
        const sx = Math.cos(a) * (3 + t * 9)
        const sy = -6 - t * 16 + Math.sin(a) * 3
        ctx.fillStyle = i % 2 ? '#fff4c2' : '#f2c64a'
        ctx.fillRect(Math.round(sx), Math.round(sy), 2, 2)
      }
      ctx.font = 'bold 6px monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#2a201a'
      ctx.fillText('thank you', 1, -14 - t * 10 + 1)
      ctx.fillStyle = '#fff1b0'
      ctx.fillText('thank you', 0, -14 - t * 10)
    } else {
      // A grey bubble with trailing dots sinks and fades: nobody answered.
      const y = Math.round(-16 + t * 6)
      ctx.fillStyle = '#4b4540'
      ctx.fillRect(-6, y - 1, 12, 7)
      ctx.fillRect(-7, y, 14, 5)
      ctx.fillStyle = '#b9b1a8'
      ctx.fillRect(-5, y, 10, 5)
      ctx.fillRect(-6, y + 1, 12, 3)
      ctx.fillStyle = '#4b4540'
      for (const dx of [-3, 0, 3]) ctx.fillRect(dx - 1, y + 2, 2, 1)
      ctx.fillRect(-1, y + 6, 2, 1)
    }
    ctx.restore()
  }
}

/** Raised hands above a praying person: two small golden marks, pulsing. */
export function drawPrayingGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  seed: number,
) {
  const a = 0.78 + 0.22 * Math.sin(now * 0.004 + seed)
  ctx.fillStyle = `rgba(247,215,116,${a})`
  ctx.fillRect(Math.round(x - 3), Math.round(y - 4), 1, 3)
  ctx.fillRect(Math.round(x + 2), Math.round(y - 4), 1, 3)
  ctx.fillRect(Math.round(x - 2), Math.round(y - 5), 1, 1)
  ctx.fillRect(Math.round(x + 1), Math.round(y - 5), 1, 1)
}

/** A bouncing note above a celebrating person. */
export function drawCelebrationGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  seed: number,
) {
  const hop = Math.round(Math.abs(Math.sin(now * 0.008 + seed)) * 3)
  const nx = Math.round(x - 1)
  const ny = Math.round(y - 6 - hop)
  ctx.fillStyle = '#ffe08a'
  ctx.fillRect(nx, ny + 3, 2, 2)
  ctx.fillRect(nx + 1, ny, 1, 4)
  ctx.fillRect(nx + 2, ny, 1, 1)
}
