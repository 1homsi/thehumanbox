import { shade } from '../sprite-colors'
import { OUTLINE, gableRoof, outline, px, wallTexture } from './kit'
import type { P } from './kit'

export function paintLandmark(p: P) {
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

export function paintProp(p: P): boolean {
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
      const cream = '#e8e0d0'
      px(p.ctx, cx - 4, y1 - 4, 8, 4, '#7a5e3e')
      // The awning, with a scalloped valance: each stripe hangs one pixel lower at its middle.
      for (let i = 0; i < 3; i++) {
        const c = i % 2 === 0 ? stripes : cream
        px(p.ctx, cx - 5 + i * 4, y1 - 7, 4, 3, c)
        px(p.ctx, cx - 4 + i * 4, y1 - 4, 2, 1, c)
      }
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
