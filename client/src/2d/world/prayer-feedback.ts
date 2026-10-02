// When a prayer disappears, show what happened on the map: a golden glow
// and "thank you" when it was answered, a grey sigh when it lapsed.
import type { FaithInfo, PrayerInfo } from '../../types'

interface Effect {
  x: number
  y: number
  answered: boolean
  start: number
}

const LIFE_MS = 1800
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
      if (blessed.has(p.lineage_id)) effects.push({ x: p.x, y: p.y, answered: true, start: now })
      else if (despairing.has(p.lineage_id)) effects.push({ x: p.x, y: p.y, answered: false, start: now })
    }
  }
  previous = current
  effects = effects.filter((e) => now - e.start < LIFE_MS).slice(-24)
}

export function prayerEffectsActive(): boolean {
  return effects.length > 0
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
