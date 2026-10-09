import { shade } from '../sprite-colors'

export const PAD = 8
export const PAD_TOP = 26
export const PAD_BOT = 4

export const OUTLINE = 'rgba(22,15,9,0.9)'
const GLOW_WARM = [255, 216, 128] as const
const GLOW_COOL = [140, 230, 255] as const

export function mulberry32(seed: number) {
  let a = seed | 0 || 1
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Ctx = CanvasRenderingContext2D

export interface P {
  ctx: Ctx
  x0: number
  y1: number
  w: number
  h: number
  rng: () => number
  night: number
  cond: number
  kind: string
  variant: number
  /** Architectural era of the owning tribe (see ERA_TIERS). */
  tier: number
  /** A passing visual state ('empty' for a spaceport whose rocket is away). */
  state: string
  /** The land a stone-age home stands on (see HomeLand in land-homes.ts). */
  land?: string
}

export function px(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

export function outline(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1)
}

export function windowGlow(p: P, x: number, y: number, w: number, h: number, cool = false) {
  const g = cool ? GLOW_COOL : GLOW_WARM
  const lit = p.night > 0 && p.cond > 0.45
  px(p.ctx, x - 1, y - 1, w + 2, h + 2, '#342f30')
  px(p.ctx, x - 1, y + h, w + 2, 1, '#bba686')
  if (lit) {
    const a = 0.45 + p.night * 0.18
    px(p.ctx, x - 1, y - 1, w + 2, h + 2, `rgba(${g[0]},${g[1]},${g[2]},${0.16 * p.night})`)
    px(p.ctx, x, y, w, h, `rgba(${g[0]},${g[1]},${g[2]},${a})`)
  } else {
    px(p.ctx, x, y, w, h, 'rgba(70,86,110,0.85)')
    px(p.ctx, x, y, w, Math.max(1, h * 0.4), 'rgba(160,190,220,0.5)')
  }
}

export function door(p: P, cx: number, gy: number, w: number, h: number, c = '#3a2414') {
  px(p.ctx, cx - w / 2, gy - h, w, h, c)
  px(p.ctx, cx - w / 2, gy - h, w, 1, 'rgba(0,0,0,0.4)')
  if (w >= 4) px(p.ctx, cx + w / 2 - 2, gy - h / 2, 1, 1, '#d8b860')
}

export function gableRoof(p: P, x: number, y: number, w: number, rh: number, c: string, over = 2) {
  const { ctx } = p
  ctx.fillStyle = c
  ctx.beginPath()
  ctx.moveTo(Math.round(x - over), Math.round(y) + 0.5)
  ctx.lineTo(Math.round(x + w + over), Math.round(y) + 0.5)
  ctx.lineTo(Math.round(x + w / 2), Math.round(y - rh) + 0.5)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.14)'
  ctx.beginPath()
  ctx.moveTo(Math.round(x + w / 2), Math.round(y - rh) + 0.5)
  ctx.lineTo(Math.round(x + w + over), Math.round(y) + 0.5)
  ctx.lineTo(Math.round(x + w * 0.58), Math.round(y) + 0.5)
  ctx.closePath()
  ctx.fill()
}

export function hipRoof(p: P, x: number, y: number, w: number, rh: number, c: string) {
  const { ctx } = p
  const inset = Math.min(w * 0.22, 8)
  ctx.fillStyle = c
  ctx.beginPath()
  ctx.moveTo(Math.round(x - 2), Math.round(y) + 0.5)
  ctx.lineTo(Math.round(x + w + 2), Math.round(y) + 0.5)
  ctx.lineTo(Math.round(x + w - inset), Math.round(y - rh) + 0.5)
  ctx.lineTo(Math.round(x + inset), Math.round(y - rh) + 0.5)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1
  ctx.stroke()
  px(p.ctx, x + inset, y - rh, w - inset * 2, 1, 'rgba(255,255,255,0.22)')
}

export function chimney(p: P, x: number, yTop: number, h = 6) {
  px(p.ctx, x, yTop - h, 3, h, '#6e6058')
  px(p.ctx, x - 1, yTop - h - 1, 5, 2, '#4e423a')
}

export function crenellation(p: P, x: number, y: number, w: number, c: string) {
  for (let i = 0; i < Math.floor(w / 4); i++) {
    if (i % 2 === 0) px(p.ctx, x + i * 4, y - 2, 3, 2, c)
  }
}

export function wallTexture(p: P, x: number, y: number, w: number, h: number, base: string) {
  px(p.ctx, x, y, w, h, base)
  px(p.ctx, x, y, w, 1, shade(base, 1.18))
  px(p.ctx, x, y + h - 2, w, 2, shade(base, 0.78))
  px(p.ctx, x, y + 1, 1, Math.max(1, h - 3), shade(base, 1.1))
  px(p.ctx, x + w - 2, y + 1, 2, Math.max(1, h - 3), shade(base, 0.84))
  const r = p.rng
  p.ctx.fillStyle = 'rgba(0,0,0,0.08)'
  for (let i = 0; i < (w * h) / 38; i++) {
    p.ctx.fillRect(Math.round(x + r() * (w - 2)), Math.round(y + 1 + r() * (h - 3)), 2, 1)
  }
}

export function timberFrame(p: P, x: number, y: number, w: number, h: number) {
  const c = '#5a4028'
  px(p.ctx, x, y, w, 1, c)
  px(p.ctx, x, y, 1, h, c)
  px(p.ctx, x + w - 1, y, 1, h, c)
  const n = Math.max(1, Math.floor(w / 10))
  for (let i = 1; i <= n; i++) px(p.ctx, x + (i * w) / (n + 1), y, 1, h, c)
}

export function cracks(p: P, x: number, y: number, w: number, h: number) {
  if (p.cond >= 0.45) return
  const r = p.rng
  p.ctx.strokeStyle = 'rgba(20,14,8,0.55)'
  p.ctx.lineWidth = 1
  for (let i = 0; i < 3; i++) {
    const sx = x + r() * w
    let cy = y + r() * h * 0.4
    p.ctx.beginPath()
    p.ctx.moveTo(sx, cy)
    let cx2 = sx
    for (let s = 0; s < 3; s++) {
      cx2 += (r() - 0.5) * 4
      cy += 2 + r() * 3
      p.ctx.lineTo(cx2, cy)
    }
    p.ctx.stroke()
  }
}

export function smoke(p: P, x: number, y: number) {
  for (let i = 0; i < 3; i++) {
    const a = 0.28 - i * 0.07
    px(p.ctx, x - i + p.rng() * 2, y - 3 - i * 3, 3 + i, 2, `rgba(205,205,205,${a})`)
  }
}
