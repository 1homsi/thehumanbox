export const PAD = 8
export const PAD_TOP = 26
export const PAD_BOT = 4

const OUTLINE = 'rgba(22,15,9,0.9)'
const GLOW_WARM = [255, 216, 128] as const
const GLOW_COOL = [140, 230, 255] as const

function mulberry32(seed: number) {
  let a = seed | 0 || 1
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function shade(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex)
  if (f >= 1) {
    const k = f - 1
    return `rgb(${Math.min(255, Math.round(r + (255 - r) * k))},${Math.min(255, Math.round(g + (255 - g) * k))},${Math.min(255, Math.round(b + (255 - b) * k))})`
  }
  return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`
}

function hueShift(hex: string, deg: number, satF = 1, lumF = 1): string {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255)
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  const d = mx - mn
  let h = 0
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (d !== 0) {
    if (mx === r) h = ((g - b) / d) % 6
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  h = (h + deg + 360) % 360
  const s2 = Math.max(0, Math.min(1, s * satF))
  const l2 = Math.max(0, Math.min(1, l * lumF))
  return `hsl(${h.toFixed(0)},${(s2 * 100).toFixed(0)}%,${(l2 * 100).toFixed(0)}%)`
}

type Ctx = CanvasRenderingContext2D

interface P {
  ctx: Ctx
  x0: number
  y1: number
  w: number
  h: number
  rng: () => number
  night: number
  cond: number
  kind: string
}

function px(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

function outline(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1)
}

function windowGlow(p: P, x: number, y: number, w: number, h: number, cool = false) {
  const g = cool ? GLOW_COOL : GLOW_WARM
  const lit = p.night > 0 && p.cond > 0.45
  if (lit) {
    const a = 0.45 + p.night * 0.18
    px(p.ctx, x - 1, y - 1, w + 2, h + 2, `rgba(${g[0]},${g[1]},${g[2]},${0.16 * p.night})`)
    px(p.ctx, x, y, w, h, `rgba(${g[0]},${g[1]},${g[2]},${a})`)
  } else {
    px(p.ctx, x, y, w, h, 'rgba(70,86,110,0.85)')
    px(p.ctx, x, y, w, Math.max(1, h * 0.4), 'rgba(160,190,220,0.5)')
  }
}

function door(p: P, cx: number, gy: number, w: number, h: number, c = '#3a2414') {
  px(p.ctx, cx - w / 2, gy - h, w, h, c)
  px(p.ctx, cx - w / 2, gy - h, w, 1, 'rgba(0,0,0,0.4)')
  if (w >= 4) px(p.ctx, cx + w / 2 - 2, gy - h / 2, 1, 1, '#d8b860')
}

function gableRoof(p: P, x: number, y: number, w: number, rh: number, c: string, over = 2) {
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

function hipRoof(p: P, x: number, y: number, w: number, rh: number, c: string) {
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

function chimney(p: P, x: number, yTop: number, h = 6) {
  px(p.ctx, x, yTop - h, 3, h, '#6e6058')
  px(p.ctx, x - 1, yTop - h - 1, 5, 2, '#4e423a')
}

function crenellation(p: P, x: number, y: number, w: number, c: string) {
  for (let i = 0; i < Math.floor(w / 4); i++) {
    if (i % 2 === 0) px(p.ctx, x + i * 4, y - 2, 3, 2, c)
  }
}

function wallTexture(p: P, x: number, y: number, w: number, h: number, base: string) {
  px(p.ctx, x, y, w, h, base)
  px(p.ctx, x, y, w, 1, shade(base, 1.18))
  px(p.ctx, x, y + h - 2, w, 2, shade(base, 0.78))
  const r = p.rng
  p.ctx.fillStyle = 'rgba(0,0,0,0.08)'
  for (let i = 0; i < (w * h) / 38; i++) {
    p.ctx.fillRect(Math.round(x + r() * (w - 2)), Math.round(y + 1 + r() * (h - 3)), 2, 1)
  }
}

function timberFrame(p: P, x: number, y: number, w: number, h: number) {
  const c = '#5a4028'
  px(p.ctx, x, y, w, 1, c)
  px(p.ctx, x, y, 1, h, c)
  px(p.ctx, x + w - 1, y, 1, h, c)
  const n = Math.max(1, Math.floor(w / 10))
  for (let i = 1; i <= n; i++) px(p.ctx, x + (i * w) / (n + 1), y, 1, h, c)
}

function cracks(p: P, x: number, y: number, w: number, h: number) {
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

function paintHut(p: P) {
  const { x0, y1, w, h } = p
  const wallH = h * 0.52
  const cx = x0 + w / 2
  const rw = w * 0.92
  px(p.ctx, cx - rw / 2, y1 - wallH, rw, wallH, '#9c7a52')
  px(p.ctx, cx - rw / 2, y1 - wallH, rw, 1, '#b08a5e')
  px(p.ctx, cx - rw / 2, y1 - 2, rw, 2, '#7a5e3e')
  outline(p.ctx, cx - rw / 2, y1 - wallH, rw, wallH)
  const thatch = hueShift('#b89a4a', (p.rng() - 0.5) * 24, 1, 0.94 + p.rng() * 0.12)
  const rh = h * 0.62
  p.ctx.fillStyle = thatch
  p.ctx.beginPath()
  p.ctx.moveTo(cx - rw / 2 - 2, y1 - wallH + 0.5)
  p.ctx.lineTo(cx + rw / 2 + 2, y1 - wallH + 0.5)
  p.ctx.lineTo(cx, y1 - wallH - rh)
  p.ctx.closePath()
  p.ctx.fill()
  p.ctx.strokeStyle = OUTLINE
  p.ctx.stroke()
  p.ctx.fillStyle = 'rgba(0,0,0,0.14)'
  for (let i = 1; i < 4; i++) {
    const t = i / 4
    px(
      p.ctx,
      cx - (rw / 2 + 2) * (1 - t) - 1,
      y1 - wallH - rh * t,
      (rw + 4) * (1 - t) + 2,
      1,
      'rgba(0,0,0,0.12)',
    )
  }
  door(p, cx, y1, Math.max(3, w * 0.22), wallH * 0.7)
  cracks(p, cx - rw / 2, y1 - wallH, rw, wallH)
}

function paintTent(p: P) {
  const { x0, y1, w, h } = p
  const cx = x0 + w / 2
  const c = hueShift('#b09060', (p.rng() - 0.5) * 40)
  p.ctx.fillStyle = c
  p.ctx.beginPath()
  p.ctx.moveTo(x0, y1)
  p.ctx.lineTo(x0 + w, y1)
  p.ctx.lineTo(cx, y1 - h * 0.95)
  p.ctx.closePath()
  p.ctx.fill()
  p.ctx.strokeStyle = OUTLINE
  p.ctx.stroke()
  p.ctx.fillStyle = 'rgba(0,0,0,0.3)'
  p.ctx.beginPath()
  p.ctx.moveTo(cx - w * 0.14, y1)
  p.ctx.lineTo(cx + w * 0.14, y1)
  p.ctx.lineTo(cx, y1 - h * 0.5)
  p.ctx.closePath()
  p.ctx.fill()
  px(p.ctx, cx, y1 - h * 0.95 - 3, 1, 4, '#5a4028')
}

function paintCottage(p: P) {
  const { x0, y1, w, h, rng } = p
  const wallH = h * 0.55
  const wallY = y1 - wallH
  const base = hueShift('#a6845a', (rng() - 0.5) * 18, 1, 0.92 + rng() * 0.18)
  wallTexture(p, x0, wallY, w, wallH, base)
  if (rng() < 0.55) timberFrame(p, x0, wallY, w, wallH)
  outline(p.ctx, x0, wallY, w, wallH)
  const roof = hueShift('#7a3a20', (rng() - 0.5) * 30, 1, 0.9 + rng() * 0.2)
  gableRoof(p, x0, wallY, w, h * 0.5, roof)
  chimney(p, rng() < 0.5 ? x0 + 3 : x0 + w - 6, wallY - h * 0.18, 7)
  door(p, x0 + w * (0.3 + rng() * 0.4), y1, Math.max(3, w * 0.16), wallH * 0.62)
  const nWin = Math.max(1, Math.floor(w / 12))
  for (let i = 0; i < nWin; i++) {
    const wx = x0 + 3 + (i * (w - 8)) / Math.max(1, nWin - 1 || 1)
    windowGlow(p, Math.min(wx, x0 + w - 6), wallY + wallH * 0.3, 3, 3)
  }
  cracks(p, x0, wallY, w, wallH)
}

function paintTownhouse(p: P, shopfront = false) {
  const { x0, y1, w, h, rng } = p
  const floors = h >= 28 ? 3 : 2
  const wallH = h * 0.82
  const wallY = y1 - wallH
  const base = hueShift('#b08868', (rng() - 0.5) * 26, 1, 0.9 + rng() * 0.2)
  wallTexture(p, x0, wallY, w, wallH, base)
  outline(p.ctx, x0, wallY, w, wallH)
  const fh = wallH / floors
  for (let f = 1; f < floors; f++) px(p.ctx, x0, wallY + f * fh, w, 1, shade(base, 0.7))
  if (rng() < 0.5) {
    const roof = hueShift('#5a2818', (rng() - 0.5) * 24)
    gableRoof(p, x0, wallY, w, h * 0.34, roof)
  } else {
    px(p.ctx, x0 - 1, wallY - 3, w + 2, 3, shade(base, 0.62))
    outline(p.ctx, x0 - 1, wallY - 3, w + 2, 3)
  }
  for (let f = 0; f < floors; f++) {
    const fy = wallY + f * fh + fh * 0.3
    const isGround = f === floors - 1
    if (isGround && shopfront) continue
    const nWin = Math.max(1, Math.floor(w / 9))
    for (let i = 0; i < nWin; i++) {
      const wx = x0 + 2.5 + (i * (w - 7)) / Math.max(1, nWin - 1 || 1)
      windowGlow(p, wx, fy, 3, 4)
    }
  }
  if (shopfront) {
    const ay = y1 - fh * 0.92
    const stripes = ['#c84848', '#3a6ea8', '#3f8a4f', '#c87f2a'][Math.floor(rng() * 4)]
    for (let i = 0; i < Math.floor((w + 4) / 4); i++) {
      px(p.ctx, x0 - 2 + i * 4, ay, 4, 3, i % 2 === 0 ? stripes : '#e8e0d0')
    }
    px(p.ctx, x0 - 2, ay + 3, w + 4, 1, 'rgba(0,0,0,0.35)')
    windowGlow(p, x0 + 2, y1 - fh * 0.6, w * 0.4, fh * 0.4)
    door(p, x0 + w * 0.78, y1, Math.max(3, w * 0.18), fh * 0.7)
  } else {
    door(p, x0 + w * (0.25 + rng() * 0.5), y1, Math.max(3, w * 0.16), fh * 0.66)
  }
  cracks(p, x0, wallY, w, wallH)
}

function paintManor(p: P) {
  const { x0, y1, w, h, rng } = p
  const wallH = h * 0.6
  const wallY = y1 - wallH
  const base = hueShift('#cfc0a0', (rng() - 0.5) * 14, 0.9, 0.92 + rng() * 0.14)
  wallTexture(p, x0, wallY, w, wallH, base)
  outline(p.ctx, x0, wallY, w, wallH)
  const nPil = Math.max(2, Math.floor(w / 12))
  for (let i = 0; i <= nPil; i++) {
    px(p.ctx, x0 + 1 + (i * (w - 3)) / nPil, wallY + 1, 2, wallH - 1, shade(base, 1.14))
  }
  hipRoof(p, x0, wallY, w, h * 0.32, hueShift('#4a3525', (rng() - 0.5) * 20))
  px(p.ctx, x0 + w / 2 - 4, wallY - h * 0.32 - 4, 8, 4, shade(base, 1.1))
  outline(p.ctx, x0 + w / 2 - 4, wallY - h * 0.32 - 4, 8, 4)
  door(p, x0 + w / 2, y1, Math.max(4, w * 0.12), wallH * 0.55, '#46301c')
  px(p.ctx, x0 + w / 2 - w * 0.1, y1 - 1, w * 0.2, 1, shade(base, 0.8))
  const nWin = Math.max(2, Math.floor(w / 10))
  for (let i = 0; i < nWin; i++) {
    const wx = x0 + 4 + (i * (w - 11)) / Math.max(1, nWin - 1)
    if (Math.abs(wx + 2 - (x0 + w / 2)) < 4) continue
    windowGlow(p, wx, wallY + wallH * 0.32, 3, 5)
  }
  cracks(p, x0, wallY, w, wallH)
}

function paintTemple(p: P) {
  const { x0, y1, w, h, rng, kind } = p
  if (kind === 'Mosque') {
    const wallH = h * 0.5
    const wallY = y1 - wallH
    wallTexture(p, x0, wallY, w, wallH, '#ded6c2')
    outline(p.ctx, x0, wallY, w, wallH)
    const cx = x0 + w / 2
    p.ctx.fillStyle = '#3f8a8a'
    p.ctx.beginPath()
    p.ctx.arc(cx, wallY, w * 0.3, Math.PI, 0)
    p.ctx.fill()
    p.ctx.strokeStyle = OUTLINE
    p.ctx.stroke()
    px(p.ctx, cx - 1, wallY - w * 0.3 - 3, 2, 4, '#d8b860')
    px(p.ctx, x0 + 1, wallY - h * 0.5, 2, h * 0.5, '#ded6c2')
    px(p.ctx, x0 + 0.5, wallY - h * 0.5 - 2, 3, 2, '#3f8a8a')
    door(p, cx, y1, Math.max(3, w * 0.14), wallH * 0.6, '#46301c')
    return
  }
  if (kind === 'Pagoda') {
    const cx = x0 + w / 2
    let ty = y1
    let tw = w
    for (let t = 0; t < 3; t++) {
      const th = h * 0.22
      px(p.ctx, cx - tw / 2, ty - th, tw, th, '#8a4a3a')
      outline(p.ctx, cx - tw / 2, ty - th, tw, th)
      px(p.ctx, cx - tw / 2 - 3, ty - th - 2, tw + 6, 3, '#5a2818')
      ty -= th + 3
      tw *= 0.72
    }
    px(p.ctx, cx - 0.5, ty - 4, 1, 4, '#d8b860')
    return
  }
  const baseH = 3
  px(p.ctx, x0 - 2, y1 - baseH, w + 4, baseH, '#b8ac94')
  outline(p.ctx, x0 - 2, y1 - baseH, w + 4, baseH)
  const colH = h * 0.42
  const colY = y1 - baseH - colH
  const nCol = Math.max(3, Math.floor(w / 8))
  px(p.ctx, x0, colY, w, colH, 'rgba(40,32,22,0.55)')
  for (let i = 0; i <= nCol; i++) {
    const cxp = x0 + 1 + (i * (w - 4)) / nCol
    px(p.ctx, cxp, colY, 3, colH, '#d8cfb8')
    px(p.ctx, cxp, colY, 1, colH, '#efe8d4')
  }
  px(p.ctx, x0 - 1, colY - 3, w + 2, 3, '#cfc4aa')
  gableRoof(p, x0 - 1, colY - 3, w + 2, h * 0.26, hueShift('#b89048', (rng() - 0.5) * 16))
  if (kind === 'Cathedral') {
    const towerTop = Math.max(10, colY - h * 0.55)
    const spireTip = Math.max(3, towerTop - h * 0.27)
    px(p.ctx, x0 + w / 2 - 2, towerTop, 4, colY - 3 - towerTop, '#cfc4aa')
    p.ctx.fillStyle = '#8a8298'
    p.ctx.beginPath()
    p.ctx.moveTo(x0 + w / 2 - 3, towerTop)
    p.ctx.lineTo(x0 + w / 2 + 3, towerTop)
    p.ctx.lineTo(x0 + w / 2, spireTip)
    p.ctx.closePath()
    p.ctx.fill()
    p.ctx.strokeStyle = OUTLINE
    p.ctx.stroke()
  }
  cracks(p, x0, colY, w, colH)
}

function paintCastle(p: P) {
  const { x0, y1, w, h, kind } = p
  const stone = '#8c8678'
  if (kind === 'Watchtower' || kind === 'Tower') {
    const tw = Math.min(w, 14)
    const cx = x0 + w / 2
    const th = Math.min(h + 10, y1 - 8)
    wallTexture(p, cx - tw / 2, y1 - th, tw, th, stone)
    outline(p.ctx, cx - tw / 2, y1 - th, tw, th)
    px(p.ctx, cx - tw / 2 - 2, y1 - th - 1, tw + 4, 3, shade(stone, 0.85))
    crenellation(p, cx - tw / 2 - 2, y1 - th - 1, tw + 4, shade(stone, 0.85))
    windowGlow(p, cx - 1.5, y1 - th + 4, 3, 4)
    door(p, cx, y1, 4, 7, '#3a2414')
    return
  }
  if (kind === 'Wall' || kind === 'Gate') {
    wallTexture(p, x0, y1 - h * 0.8, w, h * 0.8, stone)
    outline(p.ctx, x0, y1 - h * 0.8, w, h * 0.8)
    crenellation(p, x0, y1 - h * 0.8, w, shade(stone, 0.85))
    if (kind === 'Gate') {
      p.ctx.fillStyle = '#2a1c10'
      p.ctx.beginPath()
      p.ctx.arc(x0 + w / 2, y1, w * 0.28, Math.PI, 0)
      p.ctx.fill()
    }
    return
  }
  const wallH = h * 0.55
  const wallY = y1 - wallH
  wallTexture(p, x0 + 3, wallY, w - 6, wallH, stone)
  outline(p.ctx, x0 + 3, wallY, w - 6, wallH)
  crenellation(p, x0 + 3, wallY, w - 6, shade(stone, 0.85))
  const tw = Math.max(6, w * 0.18)
  const th = h * 0.85
  for (const tx of [x0, x0 + w - tw]) {
    wallTexture(p, tx, y1 - th, tw, th, shade(stone, 1.06))
    outline(p.ctx, tx, y1 - th, tw, th)
    crenellation(p, tx - 1, y1 - th, tw + 2, shade(stone, 0.85))
    windowGlow(p, tx + tw / 2 - 1.5, y1 - th + 4, 3, 3)
  }
  p.ctx.fillStyle = '#2a1c10'
  p.ctx.beginPath()
  p.ctx.arc(x0 + w / 2, y1, Math.min(6, w * 0.12), Math.PI, 0)
  p.ctx.fill()
  const fx = x0 + w / 2
  px(p.ctx, fx - 0.5, wallY - 8, 1, 8, '#5a4028')
  p.ctx.fillStyle = '#c03838'
  p.ctx.beginPath()
  p.ctx.moveTo(fx + 0.5, wallY - 8)
  p.ctx.lineTo(fx + 6, wallY - 6.5)
  p.ctx.lineTo(fx + 0.5, wallY - 5)
  p.ctx.closePath()
  p.ctx.fill()
  cracks(p, x0 + 3, wallY, w - 6, wallH)
}

function paintTowerTall(p: P) {
  const { x0, y1, w, h, kind, night } = p
  const cx = x0 + w / 2
  const th = Math.min(h + 14, y1 - 10)
  if (kind === 'Lighthouse' || kind === 'Lighthouse2') {
    const tw = Math.min(w, 10)
    for (let i = 0; i < 4; i++) {
      const sy = y1 - ((i + 1) * th) / 4
      px(p.ctx, cx - tw / 2, sy, tw, th / 4, i % 2 === 0 ? '#d8d0c0' : '#b84040')
    }
    outline(p.ctx, cx - tw / 2, y1 - th, tw, th)
    px(p.ctx, cx - tw / 2 - 1, y1 - th - 4, tw + 2, 4, '#403830')
    windowGlow(p, cx - tw / 2, y1 - th - 3, tw, 2)
    if (night > 0) {
      p.ctx.fillStyle = `rgba(255,240,160,${0.12 * night})`
      p.ctx.beginPath()
      p.ctx.moveTo(cx, y1 - th - 2)
      p.ctx.lineTo(cx + 16, y1 - th - 8)
      p.ctx.lineTo(cx + 16, y1 - th + 4)
      p.ctx.closePath()
      p.ctx.fill()
    }
    return
  }
  if (kind === 'WaterTower') {
    const hh = Math.min(h, y1 - 20)
    px(p.ctx, cx - 2, y1 - hh, 1, hh, '#5a4838')
    px(p.ctx, cx + 1, y1 - hh, 1, hh, '#5a4838')
    px(p.ctx, cx - w * 0.3, y1 - hh - 8, w * 0.6, 9, '#90a0ac')
    outline(p.ctx, cx - w * 0.3, y1 - hh - 8, w * 0.6, 9)
    p.ctx.fillStyle = '#788894'
    p.ctx.beginPath()
    p.ctx.arc(cx, y1 - hh - 8, w * 0.3, Math.PI, 0)
    p.ctx.fill()
    return
  }
  if (kind === 'Observatory') {
    const tw = Math.min(w, 16)
    wallTexture(p, cx - tw / 2, y1 - h * 0.7, tw, h * 0.7, '#a8a8b4')
    outline(p.ctx, cx - tw / 2, y1 - h * 0.7, tw, h * 0.7)
    p.ctx.fillStyle = '#707888'
    p.ctx.beginPath()
    p.ctx.arc(cx, y1 - h * 0.7, tw * 0.55, Math.PI, 0)
    p.ctx.fill()
    p.ctx.strokeStyle = OUTLINE
    p.ctx.stroke()
    px(p.ctx, cx - 1, y1 - h * 0.7 - tw * 0.55, 2, tw * 0.3, '#404858')
    return
  }
  const tw = Math.min(w, 12)
  wallTexture(p, cx - tw / 2, y1 - th, tw, th, '#9a8c74')
  outline(p.ctx, cx - tw / 2, y1 - th, tw, th)
  px(p.ctx, cx - tw / 2 - 1, y1 - th - 5, tw + 2, 5, '#d8cfb8')
  outline(p.ctx, cx - tw / 2 - 1, y1 - th - 5, tw + 2, 5)
  windowGlow(p, cx - 2, y1 - th - 4, 4, 3)
  gableRoof(p, cx - tw / 2 - 1, y1 - th - 5, tw + 2, 5, '#5a4838', 1)
}

function paintWindmill(p: P) {
  const { x0, y1, w, h, rng, kind } = p
  const cx = x0 + w / 2
  if (kind === 'Watermill') {
    paintCottage(p)
    const wx = x0 + w + 1
    p.ctx.strokeStyle = '#4a3828'
    p.ctx.lineWidth = 2
    p.ctx.beginPath()
    p.ctx.arc(wx, y1 - h * 0.25, h * 0.3, 0, Math.PI * 2)
    p.ctx.stroke()
    p.ctx.lineWidth = 1
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + 0.4
      p.ctx.beginPath()
      p.ctx.moveTo(wx, y1 - h * 0.25)
      p.ctx.lineTo(wx + Math.cos(a) * h * 0.3, y1 - h * 0.25 + Math.sin(a) * h * 0.3)
      p.ctx.stroke()
    }
    return
  }
  const tw = w * 0.5
  const th = h * 0.95
  p.ctx.fillStyle = '#9a7854'
  p.ctx.beginPath()
  p.ctx.moveTo(cx - tw / 2, y1)
  p.ctx.lineTo(cx + tw / 2, y1)
  p.ctx.lineTo(cx + tw * 0.32, y1 - th)
  p.ctx.lineTo(cx - tw * 0.32, y1 - th)
  p.ctx.closePath()
  p.ctx.fill()
  p.ctx.strokeStyle = OUTLINE
  p.ctx.stroke()
  gableRoof(p, cx - tw * 0.36, y1 - th, tw * 0.72, 4, '#5a3a22', 1)
  windowGlow(p, cx - 1.5, y1 - th * 0.45, 3, 3)
  door(p, cx, y1, 4, 6)
  const hub = { x: cx, y: y1 - th - 1 }
  const a0 = rng() * Math.PI
  const bladeLen = Math.min(h * 0.55, hub.y - 2, w / 2 + PAD - 1)
  p.ctx.strokeStyle = '#e8dcc0'
  p.ctx.lineWidth = 2
  for (let i = 0; i < 4; i++) {
    const a = a0 + (i * Math.PI) / 2
    p.ctx.beginPath()
    p.ctx.moveTo(hub.x, hub.y)
    p.ctx.lineTo(hub.x + Math.cos(a) * bladeLen, hub.y + Math.sin(a) * bladeLen)
    p.ctx.stroke()
  }
  p.ctx.lineWidth = 1
  px(p.ctx, hub.x - 1, hub.y - 1, 3, 3, '#4a3828')
}

function paintIndustrial(p: P) {
  const { x0, y1, w, h, rng, kind } = p
  const wallH = h * 0.6
  const wallY = y1 - wallH
  const base = kind === 'Forge' || kind === 'Smithy' ? '#5c4736' : '#7d7a74'
  wallTexture(p, x0, wallY, w, wallH, hueShift(base, (rng() - 0.5) * 10))
  outline(p.ctx, x0, wallY, w, wallH)
  const teeth = Math.max(2, Math.floor(w / 12))
  const toothW = w / teeth
  p.ctx.fillStyle = '#4a4844'
  for (let i = 0; i < teeth; i++) {
    p.ctx.beginPath()
    p.ctx.moveTo(x0 + i * toothW, wallY + 0.5)
    p.ctx.lineTo(x0 + (i + 1) * toothW, wallY + 0.5)
    p.ctx.lineTo(x0 + i * toothW + toothW * 0.25, wallY - h * 0.22)
    p.ctx.closePath()
    p.ctx.fill()
    p.ctx.strokeStyle = OUTLINE
    p.ctx.stroke()
    windowGlow(p, x0 + i * toothW + toothW * 0.32, wallY - h * 0.16, toothW * 0.4, h * 0.1, true)
  }
  chimney(p, x0 + w - 6, wallY - h * 0.2, 9)
  if (kind === 'Forge' || kind === 'Smithy') {
    const dw = Math.max(5, w * 0.3)
    px(p.ctx, x0 + w / 2 - dw / 2, y1 - wallH * 0.7, dw, wallH * 0.7, '#1c1410')
    px(
      p.ctx,
      x0 + w / 2 - dw / 2 + 1,
      y1 - wallH * 0.4,
      dw - 2,
      wallH * 0.4,
      `rgba(255,120,30,${0.5 + p.night * 0.15})`,
    )
    px(
      p.ctx,
      x0 + w / 2 - dw / 2 + 2,
      y1 - wallH * 0.22,
      dw - 4,
      wallH * 0.22,
      `rgba(255,200,80,${0.5 + p.night * 0.15})`,
    )
  } else {
    door(p, x0 + w * 0.3, y1, Math.max(5, w * 0.22), wallH * 0.6, '#3a3632')
  }
  cracks(p, x0, wallY, w, wallH)
}

function paintFarm(p: P) {
  const { x0, y1, w, h, rng, kind } = p
  if (kind === 'Silo') {
    const cx = x0 + w / 2
    const tw = Math.min(w, 12)
    wallTexture(p, cx - tw / 2, y1 - h, tw, h, '#b8a468')
    outline(p.ctx, cx - tw / 2, y1 - h, tw, h)
    p.ctx.fillStyle = '#8a4a3a'
    p.ctx.beginPath()
    p.ctx.arc(cx, y1 - h, tw / 2, Math.PI, 0)
    p.ctx.fill()
    p.ctx.strokeStyle = OUTLINE
    p.ctx.stroke()
    return
  }
  if (kind === 'Greenhouse' || kind === 'Greenhouse2') {
    const wallH = h * 0.55
    const wallY = y1 - wallH
    px(p.ctx, x0, wallY, w, wallH, 'rgba(170,220,200,0.55)')
    outline(p.ctx, x0, wallY, w, wallH)
    for (let i = 1; i < Math.floor(w / 6); i++)
      px(p.ctx, x0 + i * 6, wallY, 1, wallH, 'rgba(255,255,255,0.5)')
    gableRoof(p, x0, wallY, w, h * 0.3, 'rgba(190,230,215,0.7)', 1)
    px(p.ctx, x0 + 2, y1 - 3, w - 4, 2, '#3f7a3f')
    return
  }
  const wallH = h * 0.5
  const wallY = y1 - wallH
  const base = hueShift('#8a5a38', (rng() - 0.5) * 16)
  wallTexture(p, x0, wallY, w, wallH, base)
  outline(p.ctx, x0, wallY, w, wallH)
  gableRoof(p, x0, wallY, w, h * 0.42, hueShift('#6a4226', (rng() - 0.5) * 16))
  const dw = Math.max(5, w * 0.3)
  px(p.ctx, x0 + w / 2 - dw / 2, y1 - wallH * 0.85, dw, wallH * 0.85, '#2c1c10')
  px(p.ctx, x0 + w / 2 - dw / 2, y1 - wallH * 0.85, dw, 1, shade(base, 0.7))
  px(p.ctx, x0 + w / 2 - 0.5, y1 - wallH * 0.85, 1, wallH * 0.85, shade(base, 0.8))
}

function paintModern(p: P) {
  const { x0, y1, w, h, rng, kind } = p
  const tall = kind === 'Skyscraper' || kind === 'OfficeTower' || kind === 'Apartment'
  const bh = tall ? Math.min(h + 16, y1 - 8) : h * 0.85
  const by = y1 - bh
  const base =
    kind === 'Hospital' || kind === 'Hospital2' || kind === 'Clinic'
      ? '#e4e2dc'
      : kind === 'Datacenter'
        ? '#2e3440'
        : hueShift('#8b97a6', (rng() - 0.5) * 24, 1, 0.9 + rng() * 0.2)
  wallTexture(p, x0, by, w, bh, base)
  outline(p.ctx, x0, by, w, bh)
  px(p.ctx, x0 - 1, by - 2, w + 2, 2, shade(base, 0.7))
  px(p.ctx, x0 + 2, by - 4, 4, 2, shade(base, 0.6))
  if (kind === 'Datacenter') {
    for (let r = 0; r < Math.floor(bh / 5); r++) {
      for (let c = 0; c < Math.floor(w / 4); c++) {
        if ((r * 7 + c * 13 + Math.floor(rng() * 3)) % 5 === 0)
          px(p.ctx, x0 + 2 + c * 4, by + 3 + r * 5, 2, 1, '#3fdc78')
      }
    }
    return
  }
  const rows = Math.max(2, Math.floor(bh / 7))
  const cols = Math.max(2, Math.floor(w / 6))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = x0 + 2 + (c * (w - 7)) / Math.max(1, cols - 1)
      const wy = by + 3 + (r * (bh - 10)) / Math.max(1, rows - 1)
      if (p.night > 0 && rng() < 0.35) {
        px(p.ctx, wx, wy, 3, 3, 'rgba(70,86,110,0.85)')
      } else {
        windowGlow(p, wx, wy, 3, 3, kind === 'Datacenter')
      }
    }
  }
  if (kind === 'Hospital' || kind === 'Hospital2' || kind === 'Clinic') {
    px(p.ctx, x0 + w / 2 - 1, by + 2, 2, 6, '#c83030')
    px(p.ctx, x0 + w / 2 - 3, by + 4, 6, 2, '#c83030')
  }
  door(p, x0 + w / 2, y1, Math.max(4, w * 0.14), 6, '#2c3440')
}

function paintFuturistic(p: P) {
  const { x0, y1, w, h, rng, kind, night } = p
  const cx = x0 + w / 2
  if (kind === 'Biodome') {
    p.ctx.fillStyle = 'rgba(150,230,190,0.5)'
    p.ctx.beginPath()
    p.ctx.arc(cx, y1, w * 0.48, Math.PI, 0)
    p.ctx.fill()
    p.ctx.strokeStyle = OUTLINE
    p.ctx.stroke()
    for (let i = 1; i < 4; i++) {
      p.ctx.strokeStyle = 'rgba(255,255,255,0.4)'
      p.ctx.beginPath()
      p.ctx.arc(cx, y1, w * 0.48 * (i / 4), Math.PI, 0)
      p.ctx.stroke()
    }
    px(p.ctx, cx - 2, y1 - 4, 4, 4, '#3f7a3f')
    return
  }
  if (kind === 'SolarArray' || kind === 'SolarPanel' || kind === 'WindFarm' || kind === 'WindTurbine') {
    if (kind.startsWith('Solar')) {
      const rows = Math.max(1, Math.floor(h / 8))
      const cols = Math.max(1, Math.floor(w / 10))
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const sx = x0 + c * 10
          const sy = y1 - h + r * 8
          px(p.ctx, sx, sy + 2, 8, 4, '#1c3c8a')
          px(p.ctx, sx, sy + 2, 8, 1, '#4c6cd0')
          px(p.ctx, sx + 3, sy + 6, 2, 2, '#888')
        }
      }
      return
    }
    px(p.ctx, cx - 1, y1 - h - 8, 2, h + 8, '#d8dce0')
    p.ctx.strokeStyle = '#eef2f6'
    p.ctx.lineWidth = 2
    const a0 = rng() * Math.PI
    for (let i = 0; i < 3; i++) {
      const a = a0 + (i * Math.PI * 2) / 3
      p.ctx.beginPath()
      p.ctx.moveTo(cx, y1 - h - 8)
      p.ctx.lineTo(cx + Math.cos(a) * 10, y1 - h - 8 + Math.sin(a) * 10)
      p.ctx.stroke()
    }
    p.ctx.lineWidth = 1
    return
  }
  const bh = h * 0.8
  const by = y1 - bh
  wallTexture(p, x0, by, w, bh, '#454e63')
  outline(p.ctx, x0, by, w, bh)
  const glow = kind === 'FusionPlant' ? '255,100,220' : '90,220,255'
  px(p.ctx, x0, by, w, 1, `rgba(${glow},0.9)`)
  px(p.ctx, x0, y1 - 2, w, 1, `rgba(${glow},0.7)`)
  p.ctx.fillStyle = `rgba(${glow},${0.5 + night * 0.15})`
  p.ctx.beginPath()
  p.ctx.arc(cx, by + bh * 0.45, Math.min(w, bh) * 0.2, 0, Math.PI * 2)
  p.ctx.fill()
  door(p, cx, y1, Math.max(4, w * 0.14), 5, '#1c2430')
}

function paintLandmark(p: P) {
  const { x0, y1, w, h, kind } = p
  const cx = x0 + w / 2
  if (kind === 'Pyramid') {
    p.ctx.fillStyle = '#cfae6e'
    p.ctx.beginPath()
    p.ctx.moveTo(x0, y1)
    p.ctx.lineTo(x0 + w, y1)
    p.ctx.lineTo(cx, y1 - h * 0.95)
    p.ctx.closePath()
    p.ctx.fill()
    p.ctx.strokeStyle = OUTLINE
    p.ctx.stroke()
    p.ctx.fillStyle = 'rgba(0,0,0,0.18)'
    p.ctx.beginPath()
    p.ctx.moveTo(cx, y1 - h * 0.95)
    p.ctx.lineTo(x0 + w, y1)
    p.ctx.lineTo(cx + w * 0.18, y1)
    p.ctx.closePath()
    p.ctx.fill()
    return
  }
  if (kind === 'Ziggurat') {
    let tw = w
    let ty = y1
    for (let i = 0; i < 3; i++) {
      const th = h * 0.28
      px(p.ctx, cx - tw / 2, ty - th, tw, th, shade('#b08858', 1 - i * 0.08))
      outline(p.ctx, cx - tw / 2, ty - th, tw, th)
      ty -= th
      tw *= 0.66
    }
    return
  }
  if (kind === 'Coliseum') {
    const bh = h * 0.6
    wallTexture(p, x0, y1 - bh, w, bh, '#cfc0a0')
    outline(p.ctx, x0, y1 - bh, w, bh)
    for (let i = 0; i < Math.floor(w / 6); i++) {
      p.ctx.fillStyle = 'rgba(40,30,20,0.6)'
      p.ctx.beginPath()
      p.ctx.arc(x0 + 3 + i * 6, y1 - bh * 0.35, 2, Math.PI, 0)
      p.ctx.fill()
      p.ctx.fillRect(x0 + 1 + i * 6, y1 - bh * 0.35, 4, bh * 0.3)
    }
    px(p.ctx, x0 - 1, y1 - bh - 2, w + 2, 2, '#b8ac94')
    return
  }
  if (kind === 'TriumphalArch') {
    wallTexture(p, x0, y1 - h * 0.85, w, h * 0.85, '#cfc4aa')
    outline(p.ctx, x0, y1 - h * 0.85, w, h * 0.85)
    p.ctx.fillStyle = '#2a2218'
    p.ctx.beginPath()
    p.ctx.arc(cx, y1, w * 0.26, Math.PI, 0)
    p.ctx.fill()
    px(p.ctx, x0 - 1, y1 - h * 0.85 - 2, w + 2, 3, '#b8ac94')
    return
  }
  px(p.ctx, cx - w * 0.25, y1 - 3, w * 0.5, 3, '#9a948a')
  outline(p.ctx, cx - w * 0.25, y1 - 3, w * 0.5, 3)
  const ow = Math.max(2, w * 0.14)
  px(p.ctx, cx - ow / 2, y1 - h, ow, h - 2, '#b0a89c')
  px(p.ctx, cx - ow / 2, y1 - h, 1, h - 2, '#ccc4b8')
  if (kind === 'Obelisk') {
    p.ctx.fillStyle = '#b0a89c'
    p.ctx.beginPath()
    p.ctx.moveTo(cx - ow / 2, y1 - h)
    p.ctx.lineTo(cx + ow / 2, y1 - h)
    p.ctx.lineTo(cx, y1 - h - 4)
    p.ctx.closePath()
    p.ctx.fill()
  } else {
    px(p.ctx, cx - ow, y1 - h - 4, ow * 2, 5, '#a8a094')
  }
}

function paintProp(p: P): boolean {
  const { x0, y1, w, kind, night } = p
  const cx = x0 + w / 2
  switch (kind) {
    case 'Well': {
      px(p.ctx, cx - 4, y1 - 4, 8, 4, '#8c8678')
      outline(p.ctx, cx - 4, y1 - 4, 8, 4)
      px(p.ctx, cx - 3, y1 - 3, 6, 2, '#23364a')
      px(p.ctx, cx - 4, y1 - 9, 1, 6, '#5a4028')
      px(p.ctx, cx + 3, y1 - 9, 1, 6, '#5a4028')
      gableRoof(p, cx - 5, y1 - 9, 10, 3, '#6a4226', 0)
      return true
    }
    case 'Lamppost':
    case 'StreetLight': {
      px(p.ctx, cx - 0.5, y1 - 9, 1, 9, '#34302c')
      px(p.ctx, cx - 1.5, y1 - 10, 3, 2, '#34302c')
      if (night > 0) {
        const g = p.ctx.createRadialGradient(cx, y1 - 9, 0, cx, y1 - 9, 7)
        g.addColorStop(0, `rgba(255,220,120,${0.5 * night})`)
        g.addColorStop(1, 'rgba(255,220,120,0)')
        p.ctx.fillStyle = g
        p.ctx.fillRect(cx - 7, y1 - 16, 14, 14)
        px(p.ctx, cx - 1, y1 - 10, 2, 2, '#ffe9a8')
      } else {
        px(p.ctx, cx - 1, y1 - 10, 2, 2, '#c8c0a8')
      }
      return true
    }
    case 'MarketStall':
    case 'FoodCart':
    case 'Kiosk': {
      const stripes = ['#c84848', '#3a6ea8', '#3f8a4f'][Math.floor(p.rng() * 3)]
      px(p.ctx, cx - 4, y1 - 4, 8, 4, '#7a5e3e')
      for (let i = 0; i < 3; i++) px(p.ctx, cx - 5 + i * 4, y1 - 7, 4, 3, i % 2 === 0 ? stripes : '#e8e0d0')
      px(p.ctx, cx - 4, y1 - 4, 1, 4, '#4a3828')
      px(p.ctx, cx + 3, y1 - 4, 1, 4, '#4a3828')
      return true
    }
    case 'GraveStone': {
      px(p.ctx, cx - 2, y1 - 5, 4, 5, '#9a948a')
      p.ctx.fillStyle = '#9a948a'
      p.ctx.beginPath()
      p.ctx.arc(cx, y1 - 5, 2, Math.PI, 0)
      p.ctx.fill()
      return true
    }
    case 'Shrine': {
      px(p.ctx, cx - 3, y1 - 2, 6, 2, '#8c8678')
      px(p.ctx, cx - 2, y1 - 6, 4, 4, '#c8a050')
      gableRoof(p, cx - 3, y1 - 6, 6, 2, '#8a4a3a', 1)
      if (night > 0) px(p.ctx, cx - 1, y1 - 5, 2, 2, `rgba(255,200,90,${0.4 + night * 0.2})`)
      return true
    }
    case 'Statue':
    case 'Monument': {
      paintLandmark(p)
      return true
    }
    case 'FlagPole': {
      px(p.ctx, cx - 0.5, y1 - 11, 1, 11, '#a8a8a8')
      p.ctx.fillStyle = '#c03838'
      p.ctx.beginPath()
      p.ctx.moveTo(cx + 0.5, y1 - 11)
      p.ctx.lineTo(cx + 6, y1 - 9.5)
      p.ctx.lineTo(cx + 0.5, y1 - 8)
      p.ctx.closePath()
      p.ctx.fill()
      return true
    }
    case 'Fountain2': {
      px(p.ctx, cx - 5, y1 - 3, 10, 3, '#9a948a')
      outline(p.ctx, cx - 5, y1 - 3, 10, 3)
      px(p.ctx, cx - 4, y1 - 2, 8, 1, '#4a7ab0')
      px(p.ctx, cx - 0.5, y1 - 7, 1, 5, '#bcd4ec')
      px(p.ctx, cx - 2, y1 - 6, 4, 1, 'rgba(190,220,240,0.7)')
      return true
    }
    case 'Bench': {
      px(p.ctx, cx - 3, y1 - 3, 6, 1, '#7a5230')
      px(p.ctx, cx - 3, y1 - 2, 1, 2, '#5a3818')
      px(p.ctx, cx + 2, y1 - 2, 1, 2, '#5a3818')
      return true
    }
    case 'Signpost': {
      px(p.ctx, cx - 0.5, y1 - 8, 1, 8, '#785030')
      px(p.ctx, cx - 3, y1 - 8, 7, 2, '#a8825a')
      return true
    }
    case 'Cart': {
      px(p.ctx, cx - 4, y1 - 4, 8, 3, '#7a5e3e')
      p.ctx.strokeStyle = '#3a2c1c'
      p.ctx.beginPath()
      p.ctx.arc(cx - 2, y1 - 1, 1.5, 0, Math.PI * 2)
      p.ctx.arc(cx + 2, y1 - 1, 1.5, 0, Math.PI * 2)
      p.ctx.stroke()
      return true
    }
    case 'Fence': {
      px(p.ctx, x0, y1 - 3, w, 1, '#6a4e30')
      for (let i = 0; i < Math.floor(w / 3); i++) px(p.ctx, x0 + i * 3, y1 - 4, 1, 4, '#5a4028')
      return true
    }
    default:
      return false
  }
}

const ARCHETYPE: Record<string, (p: P) => void | boolean> = {}

function reg(painter: (p: P) => void | boolean, kinds: string[]) {
  for (const k of kinds) ARCHETYPE[k] = painter
}

reg(paintHut, ['Hut', 'Dovecote'])
reg(paintTent, ['Tent', 'Pavilion', 'Gazebo', 'Bandstand'])
reg(paintCottage, [
  'House',
  'Bakery',
  'Inn',
  'Workshop',
  'Cobbler',
  'Herbalist',
  'Mill',
  'Tavern',
  'Brewery',
  'Bathhouse',
  'Spa',
  'Kennel',
])
reg(
  (p) => paintTownhouse(p, false),
  [
    'TownHouse',
    'Hotel',
    'BookStore',
    'Scribe',
    'Tailor',
    'Barbershop',
    'PostOffice',
    'GuildHall',
    'ArtGallery',
    'MusicHall',
    'Theatre',
  ],
)
reg(
  (p) => paintTownhouse(p, true),
  [
    'Market',
    'Butcher',
    'Fishmonger',
    'Cheesemonger',
    'ClothingShop',
    'Jeweler',
    'Apothecary',
    'Cafe',
    'Restaurant',
    'Pharmacy',
    'MallShop',
    'Supermarket',
    'BusStop',
  ],
)
reg(paintManor, [
  'Manor',
  'School',
  'University',
  'Library',
  'Bank',
  'Courthouse',
  'CityHall',
  'Museum',
  'Stadium',
  'TrainStation',
])
reg(paintTemple, ['Temple', 'Cathedral', 'Mosque', 'Synagogue', 'Pagoda', 'Stupa', 'Mausoleum'])
reg(paintCastle, ['Castle', 'Barracks', 'Watchtower', 'Tower', 'Wall', 'Gate', 'PoliceStation'])
reg(paintTowerTall, ['Lighthouse', 'Lighthouse2', 'ClockTower', 'Observatory', 'WaterTower', 'RadioTower'])
reg(paintWindmill, ['Windmill', 'Watermill'])
reg(paintIndustrial, [
  'Factory',
  'Forge',
  'Smithy',
  'SawMill',
  'Tannery',
  'Refinery',
  'PowerPlant',
  'Warehouse',
  'Hangar',
  'Mine',
  'Quarry',
  'Goldsmith',
  'AutoShop',
  'Garage',
  'FireStation',
  'Drydock',
])
reg(paintFarm, ['Granary', 'Silo', 'Stable', 'Ranch', 'Greenhouse', 'Greenhouse2', 'Vineyard', 'Orchard'])
reg(paintModern, [
  'Apartment',
  'OfficeTower',
  'Skyscraper',
  'Hospital',
  'Hospital2',
  'Clinic',
  'Datacenter',
  'ResearchLab',
  'Studio',
  'Airport',
  'GasStation',
])
reg(paintFuturistic, [
  'Spaceport',
  'OrbitalLift',
  'FusionPlant',
  'NeuralHub',
  'AiCore',
  'Biodome',
  'Cryolab',
  'NanoFab',
  'SolarArray',
  'SolarPanel',
  'WindFarm',
  'WindTurbine',
  'ChargingStation',
])
reg(paintLandmark, ['Pyramid', 'Ziggurat', 'Coliseum', 'TriumphalArch', 'Obelisk', 'Monument', 'Statue'])
reg(paintProp, [
  'Well',
  'Lamppost',
  'StreetLight',
  'MarketStall',
  'FoodCart',
  'Kiosk',
  'GraveStone',
  'Shrine',
  'FlagPole',
  'Fountain2',
  'Bench',
  'Signpost',
  'Cart',
  'Fence',
])

const spriteCache = new Map<string, HTMLCanvasElement>()

export function hasBuildingSprite(kind: string): boolean {
  return kind in ARCHETYPE
}

export function getBuildingSprite(
  kind: string,
  fw: number,
  fh: number,
  tile: number,
  variant: number,
  night: number,
  condBucket: number,
): HTMLCanvasElement | null {
  const painter = ARCHETYPE[kind]
  if (!painter) return null
  const key = `${kind}|${fw}x${fh}|${tile}|v${variant}|n${night}|c${condBucket}`
  const hit = spriteCache.get(key)
  if (hit) return hit

  const w = fw * tile
  const h = fh * tile
  const canvas = document.createElement('canvas')
  canvas.width = w + PAD * 2
  canvas.height = h + PAD_TOP + PAD_BOT
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = false

  const p: P = {
    ctx,
    x0: PAD,
    y1: canvas.height - PAD_BOT,
    w,
    h: h + PAD_TOP * 0.45,
    rng: mulberry32(variant * 1013904223 + kind.length * 7919 + fw * 131),
    night,
    cond: condBucket === 0 ? 0.3 : 1,
    kind,
  }
  const ok = painter(p)
  if (ok === false) return null
  if (spriteCache.size > 900) spriteCache.clear()
  spriteCache.set(key, canvas)
  return canvas
}
