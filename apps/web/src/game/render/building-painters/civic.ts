import { shade, hueShift } from '../sprite-colors'
import {
  OUTLINE,
  PAD,
  cracks,
  crenellation,
  door,
  gableRoof,
  hipRoof,
  outline,
  px,
  wallTexture,
  windowGlow,
} from './kit'
import type { P } from './kit'
import { paintCottage } from './dwellings'

export function paintFortress(p: P) {
  if (p.variant % 3 === 0) {
    paintCastle(p)
    return
  }
  const { x0, y1, w, h } = p
  const keepW = w * 0.48
  const keepX = x0 + (w - keepW) / 2
  const keepY = y1 - h * 0.9
  const stone = p.variant % 3 === 1 ? '#b8aa8e' : '#778592'
  wallTexture(p, keepX, keepY, keepW, h * 0.9, stone)
  outline(p.ctx, keepX, keepY, keepW, h * 0.9)
  if (p.variant % 3 === 1) crenellation(p, keepX, keepY, keepW, '#8e826b')
  else hipRoof(p, keepX, keepY, keepW, h * 0.16, '#454e6c')
  windowGlow(p, keepX + keepW * 0.25, keepY + 5, 3, 5)
  windowGlow(p, keepX + keepW * 0.68, keepY + 5, 3, 5)
  // The low outer curtain keeps the tall inner keep legible.
  paintCastle({ ...p, h: h * 0.58 })
}

export function paintTemple(p: P) {
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

export function paintCastle(p: P) {
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

export function paintTowerTall(p: P) {
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

export function paintWindmill(p: P) {
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
