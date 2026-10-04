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
  wallTexture,
  windowGlow,
} from './kit'
import type { P } from './kit'

export function paintIndustrial(p: P) {
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

export function paintFarm(p: P) {
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

export function paintUtility(p: P) {
  const { x0, y1, w, h, kind } = p
  const cx = x0 + w / 2
  if (kind === 'Drone') {
    const cy = y1 - h * 0.4
    px(p.ctx, cx - 4, cy - 2, 8, 4, '#a7b4bf')
    for (const dx of [-w * 0.3, w * 0.3]) {
      px(p.ctx, cx + Math.min(0, dx), cy, Math.abs(dx), 1, '#9aa6b0')
      px(p.ctx, cx + dx - 3, cy - 3, 7, 1, '#c3ced2')
      px(p.ctx, cx + dx, cy - 2, 1, 3, '#606b73')
    }
    px(p.ctx, cx, cy + 2, 2, 2, '#3c666e')
  } else if (kind === 'FoodTruck') {
    px(p.ctx, x0, y1 - h * 0.4, w * 0.75, h * 0.3, '#b98b53')
    px(p.ctx, x0 + w * 0.7, y1 - h * 0.3, w * 0.3, h * 0.2, '#d4b785')
    px(p.ctx, x0 + 2, y1 - h * 0.35, w * 0.45, h * 0.12, '#344d55')
    px(p.ctx, x0 + 1, y1 - h * 0.4 - 2, w * 0.6, 2, '#bf6550')
    for (const x of [x0 + w * 0.2, x0 + w * 0.8]) px(p.ctx, x - 2, y1 - 4, 4, 4, '#252a30')
  } else if (kind === 'RoboticArm') {
    px(p.ctx, cx - 5, y1 - 3, 10, 3, '#5f6d77')
    px(p.ctx, cx - 2, y1 - h * 0.5, 4, h * 0.5 - 3, '#c19c49')
    px(p.ctx, cx, y1 - h * 0.5, w * 0.3, 3, '#d9b85e')
    px(p.ctx, cx + w * 0.3 - 1, y1 - h * 0.5, 2, h * 0.2, '#9da7ae')
    px(p.ctx, cx - 2, y1 - h * 0.5 - 1, 4, 4, '#65717c')
  } else if (['ParkingLot', 'Crosswalk'].includes(kind)) {
    px(p.ctx, x0, y1 - h * 0.3, w, h * 0.3, '#50565d')
    for (let x = x0 + 2; x < x0 + w - 2; x += 5) px(p.ctx, x, y1 - h * 0.28, 2, h * 0.24, '#d3d0b5')
  } else if (kind === 'Crane' || kind === 'Gallows') {
    px(p.ctx, cx - 2, y1 - h * 0.9, 3, h * 0.9, kind === 'Gallows' ? '#684c36' : '#cea44a')
    px(p.ctx, x0, y1 - h * 0.9, w, 3, '#a98240')
    px(p.ctx, x0 + w - 3, y1 - h * 0.9, 1, h * 0.42, '#575453')
    px(p.ctx, cx - 5, y1 - 3, 10, 3, '#68666a')
  } else if (kind === 'TelephonePole') {
    px(p.ctx, cx, y1 - h, 2, h, '#715238')
    px(p.ctx, cx - 5, y1 - h + 3, 12, 2, '#715238')
    for (let i = -4; i <= 5; i += 3) px(p.ctx, cx + i, y1 - h, 1, 4, '#bbc3c6')
  } else if (kind === 'SatelliteDish') {
    px(p.ctx, cx - 1, y1 - h * 0.45, 2, h * 0.45, '#7e8a95')
    hipRoof(p, x0 + w * 0.15, y1 - h * 0.45, w * 0.7, h * 0.24, '#b6c5ce')
    px(p.ctx, cx, y1 - h * 0.85, 1, h * 0.35, '#526370')
  } else {
    px(p.ctx, x0 + 2, y1 - h * 0.6, w - 4, h * 0.5, '#414a57')
    outline(p.ctx, x0 + 2, y1 - h * 0.6, w - 4, h * 0.5)
    px(p.ctx, x0 + 4, y1 - h * 0.55, w - 8, h * 0.3, kind === 'Substation' ? '#b5a34f' : '#49929d')
    px(p.ctx, x0 + 4, y1 - h * 0.45, Math.max(2, w - 10), 1, '#c4e2df')
    px(p.ctx, x0 + 3, y1 - h * 0.1, 2, h * 0.1, '#7b7061')
    px(p.ctx, x0 + w - 5, y1 - h * 0.1, 2, h * 0.1, '#7b7061')
  }
}
