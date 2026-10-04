import { shade, hueShift } from '../sprite-colors'
import {
  OUTLINE,
  chimney,
  cracks,
  door,
  gableRoof,
  hipRoof,
  outline,
  px,
  smoke,
  wallTexture,
  windowGlow,
} from './kit'
import type { P } from './kit'

export function paintClassicalHome(p: P) {
  // Whitewashed stone under terracotta tiles, a porch on two columns.
  const { x0, y1, w, h, rng } = p
  const wallH = h * 0.52
  const top = y1 - wallH
  const base = hueShift('#e6dcc6', (rng() - 0.5) * 10, 0.9, 0.96 + rng() * 0.06)
  wallTexture(p, x0, top, w, wallH, base)
  outline(p.ctx, x0, top, w, wallH)
  const roof = hueShift('#b5532f', (rng() - 0.5) * 14)
  gableRoof(p, x0, top, w, h * 0.26, roof, 2)
  for (let x = x0 + 1; x < x0 + w - 1; x += 3) px(p.ctx, x, top - 1, 1, 1, shade(roof, 0.7))
  const porch = w * 0.4
  px(p.ctx, x0 + w * 0.08, top + 2, porch, 2, shade(base, 0.85))
  px(p.ctx, x0 + w * 0.1, top + 4, 2, wallH - 4, '#f4eee0')
  px(p.ctx, x0 + w * 0.1 + porch - 4, top + 4, 2, wallH - 4, '#f4eee0')
  door(p, x0 + w * 0.1 + porch / 2, y1, Math.max(3, w * 0.14), wallH * 0.6, '#5a3a22')
  windowGlow(p, x0 + w * 0.7, top + wallH * 0.32, 3, 4)
  cracks(p, x0, top, w, wallH)
}

export function paintRowhouse(p: P) {
  // Industrial terraced brick: soot-dark walls, slate roof, smoking chimneys.
  const { x0, y1, w, h, rng } = p
  const wallH = h * 0.7
  const top = y1 - wallH
  const base = hueShift('#8a4a34', (rng() - 0.5) * 12, 1, 0.92 + rng() * 0.1)
  wallTexture(p, x0, top, w, wallH, base)
  for (let y = top + 3; y < y1 - 1; y += 3) px(p.ctx, x0 + 1, y, w - 2, 1, shade(base, 0.82))
  outline(p.ctx, x0, top, w, wallH)
  gableRoof(p, x0, top, w, h * 0.22, '#3e4650', 1)
  chimney(p, x0 + 2, top - h * 0.12, 7)
  chimney(p, x0 + w - 5, top - h * 0.12, 7)
  smoke(p, x0 + 3, top - h * 0.12 - 7)
  const floors = wallH > 14 ? 2 : 1
  for (let f = 0; f < floors; f++) {
    const fy = top + 3 + f * (wallH / floors)
    windowGlow(p, x0 + w * 0.2, fy, 3, 4)
    windowGlow(p, x0 + w * 0.68, fy, 3, 4)
  }
  door(p, x0 + w * 0.45, y1, Math.max(3, w * 0.16), wallH * 0.4, '#2a2626')
  cracks(p, x0, top, w, wallH)
}

export function paintGlassTower(p: P) {
  // A tall glass tower with mullions and a sky reflection band.
  const { x0, y1, w, h, rng, night } = p
  const bh = Math.min(h + 18 + (p.variant % 3) * 4, y1 - 4)
  const top = y1 - bh
  const glass = night > 0 ? '#1c2a3e' : hueShift('#5f86a8', (rng() - 0.5) * 20)
  px(p.ctx, x0, top, w, bh, glass)
  px(p.ctx, x0 + w * 0.55, top, w * 0.45, bh, 'rgba(0,0,0,0.18)')
  for (let x = x0 + 2; x < x0 + w - 1; x += 3) px(p.ctx, x, top, 1, bh, 'rgba(255,255,255,0.12)')
  for (let y = top + 4; y < y1; y += 4) {
    px(p.ctx, x0, y, w, 1, 'rgba(10,20,30,0.35)')
    if (night > 0)
      for (let x = x0 + 1; x < x0 + w - 2; x += 3)
        if (rng() < 0.4) px(p.ctx, x, y + 1, 2, 2, 'rgba(255,224,150,0.8)')
  }
  // Sky reflection sweeping down the tower.
  p.ctx.fillStyle = 'rgba(220,240,255,0.22)'
  p.ctx.beginPath()
  p.ctx.moveTo(x0, top + bh * 0.2)
  p.ctx.lineTo(x0 + w * 0.5, top)
  p.ctx.lineTo(x0 + w * 0.7, top)
  p.ctx.lineTo(x0, top + bh * 0.4)
  p.ctx.closePath()
  p.ctx.fill()
  outline(p.ctx, x0, top, w, bh)
  px(p.ctx, x0 + w / 2, top - 5, 1, 5, '#c9d4dd')
  px(p.ctx, x0 + w / 2, top - 6, 1, 1, night > 0 ? '#ff5050' : '#e8eef2')
}

export function paintFutureHome(p: P) {
  // Far-future arcology: stepped white terraces with a garden on every
  // shelf and a glowing spine, so it outgrows the glass towers before it.
  const { ctx, x0, y1, w, h, night, variant } = p
  const cx = Math.round(x0 + w / 2)
  const levels = 3 + (variant % 2)
  const glow = variant % 3 === 2 ? '255,190,110' : '90,220,255'
  const levelH = Math.max(4, Math.floor((h * 1.1) / levels))
  for (let i = 0; i < levels; i++) {
    const lw = Math.max(4, Math.round(w * (1 - i * 0.22)))
    const lx = cx - Math.floor(lw / 2)
    const ly = y1 - (i + 1) * levelH
    px(ctx, lx, ly, lw, levelH, '#e9eef3')
    px(ctx, lx + Math.ceil(lw / 2), ly, Math.floor(lw / 2), levelH, '#cfd8e1')
    px(ctx, lx + 1, ly + Math.floor(levelH / 2), lw - 2, 1, `rgba(${glow},${0.5 + night * 0.45})`)
    outline(ctx, lx, ly, lw, levelH)
  }
  // Hanging gardens on the exposed shelves, drawn last so no level hides them.
  for (let i = 0; i < levels; i++) {
    const lw = Math.max(4, Math.round(w * (1 - i * 0.22)))
    const lx = cx - Math.floor(lw / 2)
    const ly = y1 - (i + 1) * levelH
    const nw = Math.max(4, Math.round(w * (1 - (i + 1) * 0.22)))
    const shelf = i === levels - 1 ? lw : Math.max(1, Math.floor((lw - nw) / 2))
    for (const sx of i === levels - 1 ? [lx] : [lx, lx + lw - shelf]) {
      px(ctx, sx, ly - 1, shelf, 2, '#4c9a45')
      px(ctx, sx, ly - 2, Math.max(1, shelf - 1), 1, '#6cbf55')
      px(ctx, sx, ly + 1, 1, 2, '#3e7f3a')
    }
  }
  const top = y1 - levels * levelH
  px(ctx, cx - 1, top - 5, 2, 4, '#cfd8e1')
  px(ctx, cx - 1, top - 6, 2, 1, `rgba(${glow},${0.75 + night * 0.25})`)
}

export function paintMudBrickHome(p: P) {
  // Ancient flat-roofed mud-brick home: a roof terrace behind a low
  // parapet, a ladder up to it and a small dark doorway.
  const { x0, y1, w, h, rng } = p
  const wallH = h * 0.6
  const top = y1 - wallH
  const base = hueShift('#c9a473', (rng() - 0.5) * 12, 1, 0.95 + rng() * 0.08)
  wallTexture(p, x0, top, w, wallH, base)
  for (let y = top + 4; y < y1 - 1; y += 4) px(p.ctx, x0 + 1, y, w - 2, 1, shade(base, 0.9))
  outline(p.ctx, x0, top, w, wallH)
  px(p.ctx, x0 - 1, top - 2, w + 2, 2, shade(base, 0.82))
  px(p.ctx, x0 + w * 0.55, top - 5, w * 0.35, 3, '#8a6a44')
  px(p.ctx, x0 + w * 0.55, top - 5, w * 0.35, 1, '#b38c5c')
  for (let y = top - 4; y < y1 - 1; y += 2) px(p.ctx, x0 + w - 2, y, 2, 1, '#6e4f30')
  px(p.ctx, x0 + w - 2, top - 4, 1, wallH + 3, '#6e4f30')
  door(p, x0 + w * 0.32, y1, Math.max(3, w * 0.18), wallH * 0.55, '#2c1c10')
  windowGlow(p, x0 + w * 0.6, top + wallH * 0.3, 2, 2)
  cracks(p, x0, top, w, wallH)
}

export function paintVilla(p: P) {
  // A classical villa: red-tiled hip roof over a colonnaded front.
  const { x0, y1, w, h, rng } = p
  const wallH = h * 0.5
  const top = y1 - wallH
  const base = hueShift('#e9ddc2', (rng() - 0.5) * 8, 0.9, 0.97 + rng() * 0.05)
  wallTexture(p, x0, top, w, wallH, base)
  outline(p.ctx, x0, top, w, wallH)
  hipRoof(p, x0 - 1, top, w + 2, h * 0.24, hueShift('#b4502e', (rng() - 0.5) * 12))
  px(p.ctx, x0, top + 1, w, 2, shade(base, 0.82))
  const cols = Math.max(3, Math.floor(w / 4))
  for (let i = 0; i < cols; i++) {
    const cx = x0 + 1 + (i * (w - 3)) / (cols - 1)
    px(p.ctx, cx, top + 3, 2, wallH - 4, '#f8f3e6')
    px(p.ctx, cx + 1, top + 3, 1, wallH - 4, shade(base, 0.86))
  }
  px(p.ctx, x0, y1 - 1, w, 1, shade(base, 0.7))
  door(p, x0 + w / 2, y1, Math.max(3, w * 0.16), wallH * 0.62, '#4a2e1a')
  cracks(p, x0, top, w, wallH)
}

export function paintSteppedGable(p: P) {
  // Renaissance canal house: tall brick front under a stepped gable.
  const { ctx, x0, y1, w, h, rng } = p
  const wallH = h * 0.72
  const top = y1 - wallH
  const base = hueShift(['#8f4a34', '#6e5444', '#a9603f'][p.variant % 3], (rng() - 0.5) * 10)
  wallTexture(p, x0, top, w, wallH, base)
  outline(ctx, x0, top, w, wallH)
  const steps = Math.max(2, Math.min(4, Math.floor(w / 4)))
  const stepW = w / (steps * 2)
  for (let i = 0; i < steps; i++) {
    const sx = x0 + i * stepW
    const sw = w - i * stepW * 2
    px(ctx, sx, top - (i + 1) * 3, sw, 3, base)
    px(ctx, sx, top - (i + 1) * 3, sw, 1, '#e8dcc4')
    outline(ctx, sx, top - (i + 1) * 3, sw, 4)
  }
  px(ctx, x0 + w / 2 - 1, top - steps * 3 - 2, 2, 2, '#e8dcc4')
  const floors = wallH > 16 ? 3 : 2
  for (let f = 0; f < floors - 1; f++) {
    const fy = top + 3 + f * ((wallH - 6) / floors)
    windowGlow(p, x0 + w * 0.22, fy, 3, 4)
    windowGlow(p, x0 + w * 0.62, fy, 3, 4)
  }
  door(p, x0 + w / 2, y1, Math.max(3, w * 0.2), wallH * 0.3, '#30241c')
  cracks(p, x0, top, w, wallH)
}

export function paintMansard(p: P) {
  // Stone town house under a dark mansard roof with dormer windows.
  const { ctx, x0, y1, w, h, rng } = p
  const wallH = h * 0.6
  const top = y1 - wallH
  const base = hueShift('#d6cbb2', (rng() - 0.5) * 10)
  wallTexture(p, x0, top, w, wallH, base)
  outline(ctx, x0, top, w, wallH)
  const roofH = Math.max(4, h * 0.26)
  ctx.fillStyle = '#46505a'
  ctx.beginPath()
  ctx.moveTo(x0 - 1, top + 0.5)
  ctx.lineTo(x0 + w + 1, top + 0.5)
  ctx.lineTo(x0 + w - 2, top - roofH)
  ctx.lineTo(x0 + 2, top - roofH)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  px(ctx, x0 + 2, top - roofH, w - 4, 1, '#6c7782')
  for (const dx of [0.28, 0.66]) windowGlow(p, x0 + w * dx, top - roofH + 2, 2, 2)
  px(ctx, x0, top + wallH * 0.48, w, 1, shade(base, 0.78))
  windowGlow(p, x0 + w * 0.22, top + 3, 3, 4)
  windowGlow(p, x0 + w * 0.66, top + 3, 3, 4)
  door(p, x0 + w * 0.45, y1, Math.max(3, w * 0.18), wallH * 0.4, '#2e3a46')
  cracks(p, x0, top, w, wallH)
}

export function paintPorchHouse(p: P) {
  // Industrial-age clapboard house with a deep front porch.
  const { ctx, x0, y1, w, h, rng } = p
  const wallH = h * 0.56
  const top = y1 - wallH
  const base = hueShift(['#d9d2bd', '#9fb2ae', '#c9b18a'][p.variant % 3], (rng() - 0.5) * 10)
  px(ctx, x0, top, w, wallH, base)
  for (let y = top + 2; y < y1; y += 2) px(ctx, x0, y, w, 1, shade(base, 0.86))
  outline(ctx, x0, top, w, wallH)
  gableRoof(p, x0, top, w, h * 0.3, hueShift('#5a4a44', (rng() - 0.5) * 16))
  const porchY = y1 - wallH * 0.5
  px(ctx, x0 - 1, porchY - 2, w + 2, 2, '#6a5040')
  for (const dx of [0, 0.5, 1]) px(ctx, x0 + (w - 1) * dx, porchY, 1, wallH * 0.5, '#efe8d8')
  px(ctx, x0, y1 - 2, w, 1, '#efe8d8')
  windowGlow(p, x0 + w * 0.3, top + 3, 3, 3)
  windowGlow(p, x0 + w * 0.66, top + 3, 3, 3)
  door(p, x0 + w * 0.68, y1, Math.max(3, w * 0.16), wallH * 0.42, '#3a2c24')
  chimney(p, x0 + w * 0.2, top - h * 0.14, 5)
  cracks(p, x0, top, w, wallH)
}

export function paintTenement(p: P) {
  // Soot-dark brick tenement with iron fire escapes zigzagging down it.
  const { ctx, x0, y1, w, h, rng } = p
  const wallH = Math.min(h * 1.05, y1 - 4)
  const top = y1 - wallH
  const base = hueShift('#7a4636', (rng() - 0.5) * 10, 1, 0.9 + rng() * 0.1)
  wallTexture(p, x0, top, w, wallH, base)
  outline(ctx, x0, top, w, wallH)
  px(ctx, x0 - 1, top - 2, w + 2, 2, shade(base, 0.6))
  const floors = Math.max(3, Math.floor(wallH / 7))
  const fh = (wallH - 4) / floors
  for (let f = 0; f < floors; f++) {
    const fy = top + 2 + f * fh
    windowGlow(p, x0 + w * 0.18, fy + 1, 2, 3)
    windowGlow(p, x0 + w * 0.48, fy + 1, 2, 3)
    if (f < floors - 1) {
      px(ctx, x0 + w * 0.62, fy + fh - 1, w * 0.32, 1, '#26201e')
      px(ctx, x0 + w * 0.62 + (f % 2 ? 0 : w * 0.24), fy + fh - 1, 1, fh, '#26201e')
    }
  }
  chimney(p, x0 + 2, top - 2, 4)
  smoke(p, x0 + 3, top - 7)
  door(p, x0 + w * 0.3, y1, Math.max(3, w * 0.16), 5, '#221a18')
  cracks(p, x0, top, w, wallH)
}

export function paintBungalow(p: P) {
  // Modern single-storey home: flat roof, wide windows, a carport.
  const { ctx, x0, y1, w, h, rng, night } = p
  const wallH = h * 0.46
  const top = y1 - wallH
  const base = hueShift(['#ecebe5', '#c9c2b3', '#b7c4c9'][p.variant % 3], (rng() - 0.5) * 6)
  wallTexture(p, x0, top, w * 0.7, wallH, base)
  outline(ctx, x0, top, w * 0.7, wallH)
  px(ctx, x0 - 1, top - 2, w + 2, 2, '#4a4f55')
  px(ctx, x0 + w * 0.7, top, 1, wallH, '#5a6068')
  px(ctx, x0 + w - 1, top, 1, wallH, '#5a6068')
  px(ctx, x0 + w * 0.72, y1 - 3, w * 0.24, 2, ['#b33a32', '#3a5a8a', '#d8d2c0'][p.variant % 3])
  const glass = night > 0 ? 'rgba(255,214,140,0.85)' : '#8fb0c4'
  px(ctx, x0 + 2, top + 2, w * 0.36, wallH * 0.45, glass)
  px(ctx, x0 + 2, top + 2, w * 0.36, 1, 'rgba(255,255,255,0.35)')
  door(p, x0 + w * 0.56, y1, Math.max(3, w * 0.1), wallH * 0.66, '#34383e')
  px(ctx, x0 - 1, y1 - 1, w + 2, 1, '#5e8a46')
  cracks(p, x0, top, w * 0.7, wallH)
}

export function paintCubeHouse(p: P) {
  // Modernist house of stacked white boxes with a glass upper floor.
  const { ctx, x0, y1, w, h, night } = p
  const lowH = h * 0.38
  const lowTop = y1 - lowH
  wallTexture(p, x0, lowTop, w, lowH, '#efeee8')
  outline(ctx, x0, lowTop, w, lowH)
  const upW = w * 0.7
  const upX = x0 + (p.variant % 2 ? 0 : w - upW)
  const upTop = lowTop - h * 0.32
  px(ctx, upX, upTop, upW, h * 0.32, night > 0 ? '#2a3442' : '#7fa2b8')
  px(ctx, upX, upTop, upW, 1, '#f2f2ee')
  for (let x = upX + 3; x < upX + upW - 1; x += 4) px(ctx, x, upTop, 1, h * 0.32, 'rgba(240,240,236,0.6)')
  if (night > 0) px(ctx, upX + 2, upTop + 2, upW - 4, 2, 'rgba(255,214,140,0.75)')
  outline(ctx, upX, upTop, upW, h * 0.32 + 1)
  px(ctx, x0 - 1, upTop - 1, w + 2, 1, '#3e444a')
  door(p, x0 + w * 0.3, y1, Math.max(3, w * 0.12), lowH * 0.7, '#2e3338')
  windowGlow(p, x0 + w * 0.6, lowTop + 3, w * 0.25, 3)
}

export function paintEcoTower(p: P) {
  // A green tower: white floors with planted balconies and solar crowns.
  const { ctx, x0, y1, w, h, rng, night } = p
  const bh = Math.min(h + 14 + (p.variant % 3) * 3, y1 - 6)
  const top = y1 - bh
  px(ctx, x0 + 1, top, w - 2, bh, '#e4e9ea')
  px(ctx, x0 + w * 0.55, top, w * 0.45 - 1, bh, 'rgba(0,0,0,0.12)')
  outline(ctx, x0 + 1, top, w - 2, bh)
  for (let y = top + 3; y < y1 - 3; y += 4) {
    px(ctx, x0, y, w, 1, '#c9d2d4')
    for (let x = x0 + 1; x < x0 + w - 1; x += 2)
      if (rng() < 0.6) px(ctx, x, y - 1, 1, 1, rng() < 0.5 ? '#4f9a44' : '#6cbf55')
    px(ctx, x0 + 2, y + 1, w - 4, 2, night > 0 ? 'rgba(255,220,150,0.8)' : '#7ea6bd')
  }
  px(ctx, x0 - 1, top - 3, w + 2, 2, '#2f4d6e')
  for (let x = x0; x < x0 + w; x += 3) px(ctx, x, top - 3, 1, 2, '#4a7aa8')
  px(ctx, x0 + w / 2, top - 7, 1, 4, '#c9d4dd')
}

export function paintCapsuleTower(p: P) {
  // A rounded capsule tower with a band of light near its crown.
  const { ctx, x0, y1, w, h, night } = p
  const bh = Math.min(h + 20, y1 - 6)
  const top = y1 - bh
  const cx = x0 + w / 2
  const r = w / 2
  ctx.fillStyle = night > 0 ? '#25303d' : '#9fb6c6'
  ctx.beginPath()
  ctx.moveTo(x0, y1)
  ctx.lineTo(x0, top + r)
  ctx.arc(cx, top + r, r, Math.PI, 0)
  ctx.lineTo(x0 + w, y1)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  px(ctx, cx, top + 2, w / 2 - 1, bh - 2, 'rgba(0,0,0,0.16)')
  for (let y = top + r + 3; y < y1 - 2; y += 4) px(ctx, x0 + 1, y, w - 2, 1, 'rgba(255,255,255,0.18)')
  px(ctx, x0 + 1, top + r, w - 2, 2, `rgba(120,240,255,${0.55 + night * 0.4})`)
  px(ctx, x0 + 2, top + 3, 2, bh * 0.5, 'rgba(255,255,255,0.22)')
}

export function paintDomeHabitat(p: P) {
  // Far-future habitat dome over a garden, with a lit ring at its base.
  const { ctx, x0, y1, w, h, night } = p
  const cx = x0 + w / 2
  const r = w * 0.5
  const ry = Math.max(r, h * 0.85)
  px(ctx, x0, y1 - 3, w, 3, '#8e98a4')
  ctx.fillStyle = 'rgba(200,232,246,0.55)'
  ctx.beginPath()
  ctx.ellipse(cx, y1 - 3, r, ry, 0, Math.PI, 0)
  ctx.fill()
  px(ctx, cx - r * 0.6, y1 - 6, r * 1.2, 3, '#4c9a45')
  px(ctx, cx - 1, y1 - 3 - ry * 0.55, 2, ry * 0.55, '#6b4a30')
  px(ctx, cx - r * 0.45, y1 - 3 - ry * 0.8, r * 0.9, ry * 0.32, '#5fae4f')
  px(ctx, cx - r * 0.3, y1 - 3 - ry * 0.8, r * 0.4, 1, '#7fcf66')
  ctx.strokeStyle = 'rgba(230,246,255,0.95)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.ellipse(cx, y1 - 3, r, ry, 0, Math.PI, 0)
  ctx.stroke()
  px(ctx, cx - r * 0.6, y1 - 3 - ry * 0.7, 1, ry * 0.3, 'rgba(255,255,255,0.8)')
  px(ctx, x0, y1 - 4, w, 1, `rgba(90,220,255,${0.6 + night * 0.35})`)
}

export function paintHoverHome(p: P) {
  // A far-future home hovering over its own lit landing pad.
  const { ctx, x0, y1, w, h, night } = p
  const cx = x0 + w / 2
  const podW = Math.max(8, w)
  const podH = Math.max(5, Math.round(h * 0.5))
  const lift = Math.max(3, Math.round(h * 0.3))
  const bottom = y1 - lift
  px(ctx, cx - podW * 0.4, y1 - 2, podW * 0.8, 2, 'rgba(0,0,0,0.25)')
  px(ctx, cx - podW * 0.3, y1 - 1, podW * 0.6, 1, `rgba(90,220,255,${0.45 + night * 0.4})`)
  for (let i = 1; i < lift; i += 2) {
    px(ctx, cx - podW * 0.2, bottom + i, podW * 0.4, 1, `rgba(120,240,255,${0.35 - i * 0.04})`)
  }
  ctx.fillStyle = '#e9eef3'
  ctx.beginPath()
  ctx.moveTo(x0, bottom - podH * 0.35)
  ctx.lineTo(x0 + podW * 0.18, bottom)
  ctx.lineTo(x0 + podW * 0.82, bottom)
  ctx.lineTo(x0 + podW, bottom - podH * 0.35)
  ctx.lineTo(x0 + podW * 0.8, bottom - podH)
  ctx.lineTo(x0 + podW * 0.2, bottom - podH)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  px(ctx, cx, bottom - podH, podW * 0.3, podH, 'rgba(0,0,0,0.1)')
  px(
    ctx,
    x0 + podW * 0.2,
    bottom - podH * 0.62,
    podW * 0.6,
    2,
    night > 0 ? 'rgba(255,220,150,0.9)' : '#7ea6bd',
  )
  px(ctx, x0 + podW * 0.2, bottom - podH, podW * 0.6, 1, 'rgba(255,255,255,0.9)')
}
