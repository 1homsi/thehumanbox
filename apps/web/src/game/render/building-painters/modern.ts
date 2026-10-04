import { shade, hueShift } from '../sprite-colors'
import { OUTLINE, door, outline, px, smoke, wallTexture, windowGlow } from './kit'
import type { P } from './kit'
import { paintIndustrial } from './industry'

export function paintModern(p: P) {
  const { x0, y1, w, h, rng, kind } = p
  const tall = kind === 'Skyscraper' || kind === 'OfficeTower' || kind === 'Apartment'
  const heightVariant = 0.72 + (p.variant % 4) * 0.08
  const bh = tall ? Math.min((h + 16) * heightVariant, y1 - 8) : h * 0.85
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
  if (kind === 'Apartment') {
    for (let y = by + 12; y < y1 - 7; y += 12) {
      px(p.ctx, x0 + 1, y, w - 2, 2, '#bbc0bb')
      px(p.ctx, x0 + 2, y - 2, w - 4, 1, '#4a525b')
    }
  }
  if (kind === 'Skyscraper' && p.variant % 2 === 0) {
    px(p.ctx, x0 + w * 0.4, by - 6, w * 0.2, 5, '#718393')
    px(p.ctx, x0 + w / 2, by - 12, 1, 7, '#a9b9c8')
  }
  door(p, x0 + w / 2, y1, Math.max(4, w * 0.14), 6, '#2c3440')
}

export function paintFuturistic(p: P) {
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

export function paintPowerPlant(p: P) {
  const { x0, y1, w, h, night } = p
  if (p.tier < 6) {
    // Coal: a brick hall and a tall smoking stack.
    paintIndustrial({ ...p, kind: 'Factory' })
    px(p.ctx, x0 + w - 6, y1 - h - 10, 4, h * 0.7 + 10, '#5e4b40')
    px(p.ctx, x0 + w - 7, y1 - h - 11, 6, 2, '#3e322b')
    smoke(p, x0 + w - 5, y1 - h - 11)
    smoke(p, x0 + w - 3, y1 - h - 16)
    return
  }
  // Nuclear: a broad, waisted cooling tower trailing steam, beside a
  // reactor dome. The waist and flared lip are what read as "nuclear".
  const tw = w * 0.66
  const tx = x0
  const th = Math.min(h * 0.9, tw * 1.25)
  const waist = tw * 0.16
  p.ctx.fillStyle = '#d2cdc3'
  p.ctx.beginPath()
  p.ctx.moveTo(tx, y1)
  p.ctx.quadraticCurveTo(tx + waist * 2.2, y1 - th * 0.62, tx + waist * 0.7, y1 - th)
  p.ctx.lineTo(tx + tw - waist * 0.7, y1 - th)
  p.ctx.quadraticCurveTo(tx + tw - waist * 2.2, y1 - th * 0.62, tx + tw, y1)
  p.ctx.closePath()
  p.ctx.fill()
  p.ctx.strokeStyle = OUTLINE
  p.ctx.stroke()
  // Shaded far side, and the dark mouth at the top.
  p.ctx.fillStyle = 'rgba(0,0,0,0.16)'
  p.ctx.beginPath()
  p.ctx.moveTo(tx + tw * 0.62, y1)
  p.ctx.quadraticCurveTo(tx + tw * 0.6, y1 - th * 0.62, tx + tw * 0.6, y1 - th)
  p.ctx.lineTo(tx + tw - waist * 0.7, y1 - th)
  p.ctx.quadraticCurveTo(tx + tw - waist * 2.2, y1 - th * 0.62, tx + tw, y1)
  p.ctx.closePath()
  p.ctx.fill()
  px(p.ctx, tx + waist * 0.7, y1 - th, tw - waist * 1.4, 2, '#5e5a54')
  for (let i = 0; i < 4; i++) {
    const a = 0.9 - i * 0.16
    px(p.ctx, tx + waist - i, y1 - th - 3 - i * 4, tw - waist * 2 + i * 3, 3, `rgba(244,244,244,${a})`)
  }
  const dx = x0 + w * 0.8
  const dr = Math.min(w * 0.2, h * 0.4)
  px(p.ctx, dx - dr, y1 - dr * 0.6, dr * 2, dr * 0.6, '#9aa4ae')
  p.ctx.fillStyle = '#dfe4e8'
  p.ctx.beginPath()
  p.ctx.arc(dx, y1 - dr * 0.6, dr, Math.PI, 0)
  p.ctx.fill()
  p.ctx.strokeStyle = OUTLINE
  p.ctx.stroke()
  px(p.ctx, dx - 1, y1 - dr * 1.6, 2, 2, night > 0 ? '#ff6040' : '#c94a3a')
}

export function paintSpaceport(p: P) {
  // A launch pad with its gantry and a rocket standing ready.
  const { x0, y1, w, h, night } = p
  px(p.ctx, x0, y1 - 3, w, 3, '#6f7378')
  px(p.ctx, x0, y1 - 3, w, 1, '#9aa0a6')
  const gx = x0 + w * 0.22
  const gh = h * 1.25
  px(p.ctx, gx, y1 - gh, 3, gh, '#b84a32')
  for (let y = y1 - gh + 2; y < y1 - 3; y += 4) px(p.ctx, gx, y, 3, 1, '#6e2a1c')
  px(p.ctx, gx + 3, y1 - gh * 0.8, 4, 1, '#b84a32')
  const rx = x0 + w * 0.6
  if (p.state === 'empty') {
    // The rocket is away: a scorched pad and a lit beacon.
    px(p.ctx, rx - 5, y1 - 4, 10, 1, '#3a3532')
    px(p.ctx, rx - 3, y1 - 5, 6, 1, '#4a4440')
    if (night > 0) px(p.ctx, gx + 1, y1 - gh - 1, 1, 1, '#ff5050')
    return
  }
  const rw = Math.max(5, w * 0.16)
  const rh = h * 1.15
  const ry = y1 - 3 - rh
  px(p.ctx, rx - rw / 2, ry + rw, rw, rh - rw, '#eef1f4')
  px(p.ctx, rx, ry + rw, rw / 2, rh - rw, 'rgba(0,0,0,0.12)')
  p.ctx.fillStyle = '#eef1f4'
  p.ctx.beginPath()
  p.ctx.moveTo(rx - rw / 2, ry + rw)
  p.ctx.lineTo(rx + rw / 2, ry + rw)
  p.ctx.lineTo(rx, ry - 1)
  p.ctx.closePath()
  p.ctx.fill()
  p.ctx.strokeStyle = OUTLINE
  p.ctx.stroke()
  outline(p.ctx, rx - rw / 2, ry + rw, rw, rh - rw)
  px(p.ctx, rx - rw / 2 - 2, y1 - 9, 2, 6, '#c8392b')
  px(p.ctx, rx + rw / 2, y1 - 9, 2, 6, '#c8392b')
  px(p.ctx, rx - rw / 2, ry + rh * 0.35, rw, 2, '#2f4f8a')
  windowGlow(p, rx - 1, ry + rw + 3, 2, 2, true)
  if (night > 0) px(p.ctx, gx + 1, y1 - gh - 1, 1, 1, '#ff5050')
}

export function paintFusionPlant(p: P) {
  // A squat hall wearing a glowing magnetic torus.
  const { x0, y1, w, h, night } = p
  const cx = x0 + w / 2
  wallTexture(p, x0 + 1, y1 - h * 0.45, w - 2, h * 0.45, '#3f4758')
  outline(p.ctx, x0 + 1, y1 - h * 0.45, w - 2, h * 0.45)
  const ry = y1 - h * 0.55
  p.ctx.strokeStyle = `rgba(255,110,230,${0.75 + night * 0.2})`
  p.ctx.lineWidth = 3
  p.ctx.beginPath()
  p.ctx.ellipse(cx, ry, w * 0.36, h * 0.16, 0, 0, Math.PI * 2)
  p.ctx.stroke()
  p.ctx.strokeStyle = 'rgba(255,220,250,0.9)'
  p.ctx.lineWidth = 1
  p.ctx.beginPath()
  p.ctx.ellipse(cx, ry, w * 0.36, h * 0.16, 0, 0, Math.PI * 2)
  p.ctx.stroke()
  p.ctx.lineWidth = 1
  px(p.ctx, cx - 2, ry - 2, 4, 4, `rgba(255,240,255,${0.7 + night * 0.3})`)
}

export function paintOrbitalLift(p: P) {
  // A tether climbing out of sight from an anchored base.
  const { x0, y1, w, h, night } = p
  const cx = x0 + w / 2
  wallTexture(p, x0 + 1, y1 - h * 0.35, w - 2, h * 0.35, '#5a6372')
  outline(p.ctx, x0 + 1, y1 - h * 0.35, w - 2, h * 0.35)
  px(p.ctx, cx - 1, y1 - h - 22, 2, h + 22 - h * 0.35, '#c9d4dd')
  px(p.ctx, cx, y1 - h - 22, 1, h + 22 - h * 0.35, 'rgba(255,255,255,0.6)')
  px(p.ctx, cx - 3, y1 - h * 0.85, 6, 4, '#eef1f4')
  outline(p.ctx, cx - 3, y1 - h * 0.85, 6, 4)
  px(p.ctx, x0 + 1, y1 - h * 0.35, w - 2, 1, `rgba(90,220,255,${0.7 + night * 0.3})`)
}
