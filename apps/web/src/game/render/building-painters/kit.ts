import { mixHex, shade } from '../sprite-colors'
import { INK } from '../art-palette'

export const PAD = 8
export const PAD_TOP = 26
export const PAD_BOT = 4

/**
 * Inner lines: the warm ink at half strength, so on a wall it reads as a darker tone of that wall. The
 * silhouette itself is inked in full when the sprite is finished (see finish.ts).
 */
export const OUTLINE = `rgba(${INK[0]},${INK[1]},${INK[2]},0.62)`
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
  /** A passing visual state (see passingState: a spaceport's 'empty' pad, a shipyard's 'hull1'..'hull3'). */
  state: string
  /** The land a stone-age home stands on (see HomeLand in land-homes.ts). */
  land?: string
  /** A tribe's roof colour, blended into the roofs of its homes (see tribe-palette.ts). */
  roofTint?: string
}

/** A roof colour, shifted toward the tribe's tint when the home has one. */
export function tintRoof(p: P, c: string): string {
  return p.roofTint ? mixHex(c, p.roofTint, ROOF_TINT_SHARE) : c
}

/** How much of a tribe's roof colour goes into its roofs. */
export const ROOF_TINT_SHARE = 0.6

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
  px(p.ctx, x - 1, y - 1, w + 2, h + 2, '#3a2d24')
  px(p.ctx, x - 1, y + h, w + 2, 1, '#c4b08a')
  if (lit) {
    const a = 0.45 + p.night * 0.18
    px(p.ctx, x - 1, y - 1, w + 2, h + 2, `rgba(${g[0]},${g[1]},${g[2]},${0.16 * p.night})`)
    px(p.ctx, x, y, w, h, `rgba(${g[0]},${g[1]},${g[2]},${a})`)
  } else {
    px(p.ctx, x, y, w, h, 'rgba(66,92,100,0.92)')
    // Sky in the upper-left of the glass, where the light comes from.
    px(p.ctx, x, y, Math.max(1, w * 0.5), Math.max(1, h * 0.4), 'rgba(150,184,188,0.62)')
  }
}

export function door(p: P, cx: number, gy: number, w: number, h: number, c = '#4a3020') {
  px(p.ctx, cx - w / 2, gy - h, w, h, c)
  px(p.ctx, cx - w / 2, gy - h, w, 1, 'rgba(28,20,12,0.5)')
  // The door's right edge is in shade, like the wall it sits in.
  px(p.ctx, cx + w / 2 - 1, gy - h + 1, 1, h - 1, 'rgba(28,20,12,0.3)')
  if (w >= 4) px(p.ctx, cx + w / 2 - 2, gy - h / 2, 1, 1, '#c9a752')
}

/** Width of the shaded side wall on the right of a wall of this width: none when too narrow to spare it. */
export function sideWidth(w: number): number {
  if (w < 7) return 0
  return w < 14 ? 2 : w < 28 ? 3 : 4
}

/** The light, middle and shade tones of a roof colour: lit on the left slope, shaded on the right. */
function roofTones(c: string): [string, string] {
  // Translucent roofs (greenhouse glass) cannot be shaded by arithmetic: the shade is drawn over them.
  return c.startsWith('#') ? [shade(c, 1.12), shade(c, 0.74)] : [c, c]
}

export function gableRoof(p: P, x: number, y: number, w: number, rh: number, colour: string, over = 2) {
  const { ctx } = p
  const [lit, dark] = roofTones(tintRoof(p, colour))
  // No two roofs set out quite alike: the eaves overhang a little more or less on each side, and on a
  // roof wide enough the ridge sits a pixel off the middle, as a hand-built roof does.
  const skew = w >= 12 ? Math.floor(p.rng() * 3) - 1 : 0
  const left = Math.round(x - over - (p.rng() < 0.3 ? 1 : 0))
  const right = Math.round(x + w + over + (p.rng() < 0.3 ? 1 : 0))
  const apex = Math.round(x + w / 2) + skew
  const top = Math.round(y - rh) + 0.5
  const eave = Math.round(y) + 0.5
  ctx.fillStyle = lit
  ctx.beginPath()
  ctx.moveTo(left, eave)
  ctx.lineTo(apex, eave)
  ctx.lineTo(apex, top)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = dark
  ctx.beginPath()
  ctx.moveTo(apex, eave)
  ctx.lineTo(right, eave)
  ctx.lineTo(apex, top)
  ctx.closePath()
  ctx.fill()
  if (!colour.startsWith('#')) {
    ctx.fillStyle = 'rgba(24,16,10,0.26)'
    ctx.fill()
  }
  // Tile courses, each a darker tone of the slope's own colour, laid a little unevenly.
  ctx.fillStyle = 'rgba(40,26,14,0.16)'
  for (let row = 2; row < rh; row += 3) {
    const half = ((w + over * 2) / 2) * (1 - row / rh)
    const start = Math.round(apex - half + 1)
    const len = Math.max(1, Math.round(half * 2 - 2))
    for (let i = 0; i < len; i++) if (p.rng() > 0.12) ctx.fillRect(start + i, Math.round(y - row), 1, 1)
  }
  // A few odd tiles: one weathered lighter, one darker where it was replaced.
  if (colour.startsWith('#')) {
    for (let i = 0; i < Math.max(1, Math.floor(w / 6)); i++) {
      const row = 1 + Math.floor(p.rng() * Math.max(1, rh - 2))
      const half = ((w + over * 2) / 2) * (1 - row / rh)
      if (half < 2) continue
      const tx = Math.round(apex - half + 1 + p.rng() * (half * 2 - 2))
      px(ctx, tx, Math.round(y - row), 1, 1, shade(tintRoof(p, colour), i % 2 ? 0.62 : 1.24))
    }
  }
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(left, eave)
  ctx.lineTo(right, eave)
  ctx.lineTo(apex, top)
  ctx.closePath()
  ctx.stroke()
  // The eave throws a thin shadow on the wall just under it.
  px(ctx, x, y + 1, w, 1, 'rgba(36,24,14,0.3)')
}

export function hipRoof(p: P, x: number, y: number, w: number, rh: number, colour: string) {
  const { ctx } = p
  const inset = Math.min(w * 0.22, 8)
  const mid = tintRoof(p, colour)
  const [lit, dark] = roofTones(mid)
  const eave = Math.round(y) + 0.5
  const top = Math.round(y - rh) + 0.5
  const xl = Math.round(x - 2)
  const xr = Math.round(x + w + 2)
  const il = Math.round(x + inset)
  const ir = Math.round(x + w - inset)
  const poly = (c: string, pts: [number, number][]) => {
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (const [px_, py_] of pts.slice(1)) ctx.lineTo(px_, py_)
    ctx.closePath()
    ctx.fill()
  }
  // Front face in the middle, the two hip ends beside it: the left one lit, the right one in shade.
  poly(mid, [
    [il, eave],
    [ir, eave],
    [ir, top],
    [il, top],
  ])
  poly(lit, [
    [xl, eave],
    [il, eave],
    [il, top],
  ])
  poly(dark, [
    [ir, eave],
    [xr, eave],
    [ir, top],
  ])
  ctx.fillStyle = 'rgba(40,26,14,0.16)'
  for (let row = 2; row < rh; row += 3) ctx.fillRect(il, Math.round(y - row), Math.max(1, ir - il), 1)
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(xl, eave)
  ctx.lineTo(xr, eave)
  ctx.lineTo(ir, top)
  ctx.lineTo(il, top)
  ctx.closePath()
  ctx.stroke()
  px(ctx, x + inset, y - rh, w - inset * 2, 1, 'rgba(255,244,214,0.28)')
  px(ctx, x, y + 1, w, 1, 'rgba(36,24,14,0.3)')
}

export function chimney(p: P, x: number, yTop: number, h = 6) {
  px(p.ctx, x, yTop - h, 3, h, '#7a665a')
  px(p.ctx, x, yTop - h, 1, h, '#92796a')
  px(p.ctx, x + 2, yTop - h, 1, h, '#5a493f')
  px(p.ctx, x - 1, yTop - h - 1, 5, 2, '#4a3a32')
}

/** The right-hand side of something already painted, in shade: a darker strip set off by a corner line. */
export function sideShade(p: P, x: number, y: number, w: number, h: number) {
  const sw = Math.max(1, sideWidth(w) || 1)
  px(p.ctx, x + w - sw, y, sw, h, 'rgba(24,16,10,0.34)')
  px(p.ctx, x + w - sw, y, 1, h, 'rgba(24,16,10,0.2)')
}

/** Round things (silos, towers, minarets) lit on the left and shaded on the right, over their flat colour. */
export function cylinder(p: P, x: number, y: number, w: number, h: number) {
  const band = Math.max(1, Math.round(w * 0.26))
  px(p.ctx, x + 1, y, Math.max(1, Math.round(w * 0.2)), h, 'rgba(255,244,214,0.22)')
  px(p.ctx, x + w - band, y, band, h, 'rgba(24,16,10,0.3)')
}

/** A half-dome over a flat base at (cx, cy): the right quarter in shade, a glint where the light hits. */
export function dome(p: P, cx: number, cy: number, r: number) {
  p.ctx.fillStyle = 'rgba(24,16,10,0.3)'
  p.ctx.beginPath()
  p.ctx.moveTo(cx, cy)
  p.ctx.arc(cx, cy, r, -Math.PI / 2, 0)
  p.ctx.closePath()
  p.ctx.fill()
  px(p.ctx, cx - r * 0.55, cy - r * 0.62, Math.max(1, r * 0.3), 1, 'rgba(255,244,214,0.4)')
}

export function crenellation(p: P, x: number, y: number, w: number, c: string) {
  for (let i = 0; i < Math.floor(w / 4); i++) {
    if (i % 2 === 0) px(p.ctx, x + i * 4, y - 2, 3, 2, c)
  }
}

/**
 * A wall lit from the top-left: a light top edge and left edge on the front face, and on the right a
 * narrower side wall in shade (see sideWidth), set off by a darker corner line.
 */
export function wallTexture(p: P, x: number, y: number, w: number, h: number, base: string) {
  const sw = sideWidth(w)
  const fw = w - sw
  px(p.ctx, x, y, w, h, base)
  px(p.ctx, x, y, fw, 1, shade(base, 1.18))
  px(p.ctx, x, y + 1, 1, Math.max(1, h - 3), shade(base, 1.1))
  px(p.ctx, x, y + h - 2, w, 2, shade(base, 0.78))
  // The wall's surface: a few pixels a tone lighter or darker than the wall itself, as plaster, stone
  // and timber weather, rather than flecks of grey over everything.
  const r = p.rng
  const lighter = shade(base, 1.08)
  const darker = shade(base, 0.9)
  for (let i = 0; i < (fw * h) / 30; i++) {
    const c = r() < 0.5 ? lighter : darker
    px(p.ctx, x + 1 + r() * (fw - 3), y + 2 + r() * (h - 5), r() < 0.6 ? 2 : 1, 1, c)
  }
  // A footing of uneven stones along the ground.
  if (h >= 8 && fw >= 6) {
    const stone = shade(base, 0.7)
    let sx = x
    while (sx < x + fw - 1) {
      const sw2 = 2 + Math.floor(r() * 3)
      px(p.ctx, sx, y + h - 2, Math.min(sw2, x + fw - sx) - 1, 2, r() < 0.5 ? stone : shade(stone, 1.12))
      sx += sw2
    }
  }
  if (sw === 0) {
    px(p.ctx, x + w - 2, y + 1, 2, Math.max(1, h - 3), shade(base, 0.84))
    return
  }
  const side = shade(base, 0.64)
  px(p.ctx, x + fw, y, sw, h, side)
  px(p.ctx, x + fw, y, sw, 1, shade(base, 0.8))
  px(p.ctx, x + fw, y + 1, 1, h - 1, shade(base, 0.5))
  px(p.ctx, x + fw, y + h - 2, sw, 2, shade(base, 0.5))
}

export function timberFrame(p: P, x: number, y: number, w: number, h: number) {
  const c = '#5a4028'
  const fw = w - sideWidth(w)
  px(p.ctx, x, y, fw, 1, c)
  px(p.ctx, x, y, 1, h, c)
  px(p.ctx, x + fw - 1, y, 1, h, c)
  const n = Math.max(1, Math.floor(fw / 10))
  for (let i = 1; i <= n; i++) px(p.ctx, x + (i * fw) / (n + 1), y, 1, h, c)
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
    px(p.ctx, x - i + p.rng() * 2, y - 3 - i * 3, 3 + i, 2, `rgba(214,205,190,${a})`)
  }
}
