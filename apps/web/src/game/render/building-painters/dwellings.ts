import { shade, hueShift } from '../sprite-colors'
import {
  OUTLINE,
  tintRoof,
  chimney,
  cracks,
  door,
  gableRoof,
  hipRoof,
  outline,
  px,
  timberFrame,
  wallTexture,
  windowGlow,
} from './kit'
import type { P } from './kit'

export function paintHut(p: P) {
  const { x0, y1, w, h } = p
  // Low thatched dwellings, with timber and mud-plaster variants. Keeping
  // the roof squat prevents a one-tile hut from swallowing the row behind it.
  const timber = p.variant % 3 === 1
  const wallH = h * 0.42
  const cx = x0 + w / 2
  const rw = w * 0.92
  px(p.ctx, cx - rw / 2, y1 - wallH, rw, wallH, timber ? '#806346' : '#b59b70')
  px(p.ctx, cx - rw / 2, y1 - wallH, rw, 1, '#b08a5e')
  px(p.ctx, cx - rw / 2, y1 - 2, rw, 2, '#7a5e3e')
  outline(p.ctx, cx - rw / 2, y1 - wallH, rw, wallH)
  const thatch = tintRoof(p, hueShift('#b89a4a', (p.rng() - 0.5) * 24, 1, 0.94 + p.rng() * 0.12))
  if (timber) {
    for (let row = 2; row < wallH; row += 3) px(p.ctx, cx - rw / 2, y1 - row, rw, 1, '#54422f')
  }
  const rh = h * (p.variant % 3 === 2 ? 0.3 : 0.4)
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

export function paintTent(p: P) {
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

export function paintCottage(p: P) {
  const { x0, y1, w, h, rng } = p
  const style = p.variant % 3
  const wallH = h * (style === 1 ? 0.48 : 0.55)
  const wallY = y1 - wallH
  const wallColors = ['#c4b38d', '#9e987e', '#ac8962']
  const roofColors = ['#874b32', '#565e58', '#a58c4d']
  const base = hueShift(wallColors[style], (rng() - 0.5) * 12, 1, 0.95 + rng() * 0.1)
  wallTexture(p, x0, wallY, w, wallH, base)
  if (style === 0) timberFrame(p, x0, wallY, w, wallH)
  outline(p.ctx, x0, wallY, w, wallH)
  const roof = hueShift(roofColors[style], (rng() - 0.5) * 12)
  gableRoof(p, x0, wallY, w, h * (style === 1 ? 0.32 : 0.4), roof)
  chimney(p, style === 2 ? x0 + 3 : x0 + w - 5, wallY - h * 0.18, 6)
  // Put the entrance and window in separate bays even at the smallest scale.
  const doorX = x0 + w * (style === 1 ? 0.7 : 0.3)
  const windowX = x0 + w * (style === 1 ? 0.2 : 0.66)
  door(p, doorX, y1, Math.max(3, w * 0.16), wallH * 0.62)
  windowGlow(p, windowX, wallY + wallH * 0.26, 3, 3)
  px(p.ctx, windowX - 1, wallY + wallH * 0.26, 1, 3, '#584e38')
  px(p.ctx, windowX + 3, wallY + wallH * 0.26, 1, 3, '#584e38')
  // Doorstep sits inside the footprint, leaving neighboring streets clear.
  px(p.ctx, doorX - 2, y1 - 1, 4, 1, '#ada48a')
  cracks(p, x0, wallY, w, wallH)
}

export function paintTownhouse(p: P, shopfront = false) {
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

export function paintManor(p: P) {
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

// Different rooflines and materials, not just recolors. The stable building ID
// selects a plan once; day/night and damage never change its architecture.
export function paintDwelling(p: P) {
  const plan = p.variant % 4
  if (plan === 0) {
    paintCottage(p)
    return
  }
  const { x0, y1, w, h } = p
  const wallH = h * (plan === 3 ? 0.7 : 0.5)
  const top = y1 - wallH
  const base = plan === 1 ? '#d0b994' : plan === 2 ? '#998775' : '#dfd1ac'
  wallTexture(p, x0, top, w, wallH, base)
  outline(p.ctx, x0, top, w, wallH)
  if (plan === 1) {
    // Low plaster courtyard home with a flat parapet and a shaded porch.
    px(p.ctx, x0 - 1, top - 3, w + 2, 4, '#ab8f68')
    px(p.ctx, x0, top - 3, w, 1, '#ead9b7')
    px(p.ctx, x0 + w * 0.52, y1 - wallH * 0.55, w * 0.48 + 2, 3, '#785538')
    px(p.ctx, x0 + w - 1, y1 - wallH * 0.55, 1, wallH * 0.55, '#67452d')
  } else if (plan === 2) {
    // Broad stone house with a slate hip roof.
    hipRoof(p, x0, top, w, h * 0.34, '#586570')
    chimney(p, x0 + w - 7, top - h * 0.2, 6)
    for (let row = top + 4; row < y1; row += 4) px(p.ctx, x0 + 1, row, w - 2, 1, '#7c7065')
  } else {
    // Tall timber home with an overhanging upper floor.
    timberFrame(p, x0, top, w, wallH)
    px(p.ctx, x0 - 1, top + wallH * 0.5, w + 2, 2, '#60432e')
    gableRoof(p, x0, top, w, h * 0.32, '#904b36')
    windowGlow(p, x0 + w * 0.48, top + 3, 3, 4)
  }
  door(p, x0 + w * 0.35, y1, Math.max(3, w * 0.16), wallH * 0.6)
  windowGlow(p, x0 + w * 0.7, top + wallH * 0.55, 3, 3)
  cracks(p, x0, top, w, wallH)
}

export function paintEarlyHome(p: P) {
  if (p.variant % 3 === 0) {
    paintHut(p)
    return
  }
  const { x0, y1, w, h } = p
  const top = y1 - h * 0.48
  const turf = p.variant % 3 === 2
  wallTexture(p, x0, top, w, y1 - top, turf ? '#8c8971' : '#886040')
  if (!turf) {
    for (let y = top + 3; y < y1; y += 3) px(p.ctx, x0 - 1, y, w + 2, 1, '#513922')
  }
  gableRoof(p, x0, top, w, h * 0.38, turf ? '#63784b' : '#9e8150')
  door(p, x0 + w * 0.5, y1, Math.max(3, w * 0.25), h * 0.3)
  cracks(p, x0, top, w, y1 - top)
}
