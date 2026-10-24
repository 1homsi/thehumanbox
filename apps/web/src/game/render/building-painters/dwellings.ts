import { shade, hueShift } from '../sprite-colors'
import {
  OUTLINE,
  tintRoof,
  chimney,
  cracks,
  crenellation,
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
  wallTexture(p, cx - rw / 2, y1 - wallH, rw, wallH, timber ? '#806346' : '#b59b70')
  outline(p.ctx, cx - rw / 2, y1 - wallH, rw, wallH)
  const thatch = tintRoof(p, hueShift('#b89a4a', (p.rng() - 0.5) * 24, 1, 0.94 + p.rng() * 0.12))
  if (timber) {
    for (let row = 2; row < wallH; row += 3) px(p.ctx, cx - rw / 2, y1 - row, rw, 1, '#54422f')
  }
  const rh = h * (p.variant % 3 === 2 ? 0.3 : 0.4)
  // Thatch lit on the left slope and shaded on the right.
  p.ctx.fillStyle = shade(thatch, 1.1)
  p.ctx.beginPath()
  p.ctx.moveTo(cx - rw / 2 - 2, y1 - wallH + 0.5)
  p.ctx.lineTo(cx, y1 - wallH + 0.5)
  p.ctx.lineTo(cx, y1 - wallH - rh)
  p.ctx.closePath()
  p.ctx.fill()
  p.ctx.fillStyle = shade(thatch, 0.76)
  p.ctx.beginPath()
  p.ctx.moveTo(cx, y1 - wallH + 0.5)
  p.ctx.lineTo(cx + rw / 2 + 2, y1 - wallH + 0.5)
  p.ctx.lineTo(cx, y1 - wallH - rh)
  p.ctx.closePath()
  p.ctx.fill()
  p.ctx.strokeStyle = OUTLINE
  p.ctx.beginPath()
  p.ctx.moveTo(cx - rw / 2 - 2, y1 - wallH + 0.5)
  p.ctx.lineTo(cx + rw / 2 + 2, y1 - wallH + 0.5)
  p.ctx.lineTo(cx, y1 - wallH - rh)
  p.ctx.closePath()
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
  // Hide lit on the left of the ridge, in shade on the right.
  p.ctx.fillStyle = shade(c, 1.1)
  p.ctx.beginPath()
  p.ctx.moveTo(x0, y1)
  p.ctx.lineTo(cx, y1)
  p.ctx.lineTo(cx, y1 - h * 0.95)
  p.ctx.closePath()
  p.ctx.fill()
  p.ctx.fillStyle = shade(c, 0.72)
  p.ctx.beginPath()
  p.ctx.moveTo(cx, y1)
  p.ctx.lineTo(x0 + w, y1)
  p.ctx.lineTo(cx, y1 - h * 0.95)
  p.ctx.closePath()
  p.ctx.fill()
  p.ctx.strokeStyle = OUTLINE
  p.ctx.beginPath()
  p.ctx.moveTo(x0, y1)
  p.ctx.lineTo(x0 + w, y1)
  p.ctx.lineTo(cx, y1 - h * 0.95)
  p.ctx.closePath()
  p.ctx.stroke()
  p.ctx.fillStyle = 'rgba(20,12,6,0.4)'
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

/**
 * A village home of the cottage era in one of three plans, so a village is not one house stamped
 * out in three colours: the gabled cottage, a long low cottage under a hipped roof, and a cottage
 * with a lean-to shed against one side. Trade buildings keep the plain cottage (their signs hang on
 * its window).
 */
export function paintVillageHome(p: P) {
  switch (Math.floor(p.variant / 3) % 3) {
    case 1:
      return paintLongCottage(p)
    case 2:
      return paintLeanToCottage(p)
    default:
      return paintCottage(p)
  }
}

/** A long, low cottage: the ridge runs along the front, so its roof is hipped, with two windows. */
function paintLongCottage(p: P) {
  const { x0, y1, w, h, rng } = p
  const style = p.variant % 3
  const wallH = Math.round(h * 0.46)
  const wallY = y1 - wallH
  const base = hueShift(['#c8b48a', '#a39a80', '#b08c66'][style], (rng() - 0.5) * 12, 1, 0.95 + rng() * 0.1)
  wallTexture(p, x0, wallY, w, wallH, base)
  outline(p.ctx, x0, wallY, w, wallH)
  const roof = hueShift(['#7f4a33', '#5b6258', '#9c8448'][style], (rng() - 0.5) * 12)
  hipRoof(p, x0, wallY, w, Math.max(4, Math.round(h * 0.3)), roof)
  chimney(p, x0 + Math.round(w * (rng() < 0.5 ? 0.28 : 0.62)), wallY - h * 0.22, 5)
  // Door to one side, a window in each bay the wall is wide enough for.
  const doorRight = rng() < 0.5
  const doorX = x0 + w * (doorRight ? 0.7 : 0.3)
  door(p, doorX, y1, Math.max(3, w * 0.15), wallH * 0.66)
  const wy = wallY + Math.max(2, Math.round(wallH * 0.28))
  const bays = w >= 20 ? [0.12, 0.4] : [0.16]
  for (const wx of bays.map((b) => x0 + Math.round(w * (doorRight ? b : 0.84 - b - 3 / w)))) {
    windowGlow(p, wx, wy, 3, 3)
    px(p.ctx, wx, wy + 3, 3, 1, shade(base, 0.6))
  }
  px(p.ctx, doorX - 2, y1 - 1, 4, 1, '#ada48a')
  cracks(p, x0, wallY, w, wallH)
}

/** A gabled cottage with a lower lean-to shed against one side, its roof sloping away from the house. */
function paintLeanToCottage(p: P) {
  const { x0, y1, w, h, rng } = p
  const style = p.variant % 3
  const shedLeft = rng() < 0.5
  const shedW = Math.max(4, Math.round(w * 0.36))
  const mainW = w - shedW
  const mainX = shedLeft ? x0 + shedW : x0
  const shedX = shedLeft ? x0 : x0 + mainW
  const wallH = Math.round(h * 0.52)
  const wallY = y1 - wallH
  const base = hueShift(['#c4b38d', '#9e987e', '#ac8962'][style], (rng() - 0.5) * 12, 1, 0.95 + rng() * 0.1)
  const roof = hueShift(['#874b32', '#565e58', '#a58c4d'][style], (rng() - 0.5) * 12)
  // The shed: plank walls, lower than the house, under a single slope of the same roofing.
  const shedH = Math.max(3, Math.round(wallH * 0.7))
  const shedY = y1 - shedH
  const planks = shade(base, 0.72)
  px(p.ctx, shedX, shedY, shedW, shedH, planks)
  for (let i = 1; i < shedW; i += 2) px(p.ctx, shedX + i, shedY + 1, 1, shedH - 1, shade(planks, 0.86))
  outline(p.ctx, shedX, shedY, shedW, shedH)
  // Its roof: two rows of roofing dropping two pixels from the house wall to the outer edge.
  const shedRoof = shade(tintRoof(p, roof), 0.86)
  for (let i = -1; i <= shedW; i++) {
    const t = shedLeft ? 1 - (i + 1) / (shedW + 1) : (i + 1) / (shedW + 1)
    const y = shedY - 2 + Math.round(t * 2)
    px(p.ctx, shedX + i, y - 1, 1, 1, OUTLINE)
    px(p.ctx, shedX + i, y, 1, 2, shedRoof)
  }
  // The house itself.
  wallTexture(p, mainX, wallY, mainW, wallH, base)
  if (style === 0) timberFrame(p, mainX, wallY, mainW, wallH)
  outline(p.ctx, mainX, wallY, mainW, wallH)
  gableRoof(p, mainX, wallY, mainW, h * 0.34, roof)
  chimney(p, shedLeft ? mainX + mainW - 4 : mainX + 1, wallY - h * 0.16, 5)
  const doorX = mainX + mainW * 0.5
  door(p, doorX, y1, Math.max(3, mainW * 0.2), wallH * 0.62)
  // A small shuttered hatch on the shed.
  px(p.ctx, shedX + Math.floor(shedW / 2) - 1, shedY + 1, 2, 2, '#3a2c20')
  px(p.ctx, doorX - 2, y1 - 1, 4, 1, '#ada48a')
  cracks(p, mainX, wallY, mainW, wallH)
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
    const stripes = ['#b0503f', '#46688a', '#5b7f46', '#b98332'][Math.floor(rng() * 4)]
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
  // Four plans, not four recolours: a street of manors should not look stamped out.
  switch (p.variant % 4) {
    case 1:
      return paintWingedManor(p)
    case 2:
      return paintTowerManor(p)
    case 3:
      return paintTimberHall(p)
    default:
      return paintHipManor(p)
  }
}

/** The classic plan: a broad plastered block under a hip roof, pilasters and a small dormer. */
function paintHipManor(p: P) {
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

/** A tall main house with a lower wing on one side under its own roof. */
function paintWingedManor(p: P) {
  const { x0, y1, w, h, rng } = p
  const wingLeft = rng() < 0.5
  const mainW = Math.round(w * 0.6)
  const wingW = w - mainW
  const mainX = wingLeft ? x0 + wingW : x0
  const wingX = wingLeft ? x0 : x0 + mainW
  const base = hueShift('#d6c7a4', (rng() - 0.5) * 16, 0.9, 0.92 + rng() * 0.12)
  const roof = hueShift('#7a3f2c', (rng() - 0.5) * 18)
  // The wing first, so the main house's roof overlaps it.
  const wingH = h * 0.42
  wallTexture(p, wingX, y1 - wingH, wingW, wingH, shade(base, 0.96))
  outline(p.ctx, wingX, y1 - wingH, wingW, wingH)
  gableRoof(p, wingX, y1 - wingH, wingW, h * 0.2, shade(roof, 0.95), 1)
  windowGlow(p, wingX + wingW / 2 - 1, y1 - wingH * 0.62, 3, 3)
  const mainH = h * 0.62
  wallTexture(p, mainX, y1 - mainH, mainW, mainH, base)
  outline(p.ctx, mainX, y1 - mainH, mainW, mainH)
  gableRoof(p, mainX, y1 - mainH, mainW, h * 0.3, roof)
  chimney(p, mainX + (wingLeft ? mainW - 5 : 2), y1 - mainH - h * 0.16, 6)
  door(p, mainX + mainW * 0.5, y1, Math.max(4, mainW * 0.18), mainH * 0.42, '#4a2f1c')
  windowGlow(p, mainX + 2, y1 - mainH * 0.78, 3, 4)
  windowGlow(p, mainX + mainW - 6, y1 - mainH * 0.78, 3, 4)
  cracks(p, mainX, y1 - mainH, mainW, mainH)
}

/** Stone house with a square corner tower, the kind a family with land builds to be seen from afar. */
function paintTowerManor(p: P) {
  const { x0, y1, w, h, rng } = p
  const stone = hueShift('#a69c88', (rng() - 0.5) * 12, 0.9, 0.92 + rng() * 0.12)
  const towerRight = rng() < 0.5
  const towerW = Math.max(6, Math.round(w * 0.28))
  const towerX = towerRight ? x0 + w - towerW : x0
  const houseX = towerRight ? x0 : x0 + towerW
  const houseW = w - towerW
  const houseH = h * 0.52
  wallTexture(p, houseX, y1 - houseH, houseW, houseH, stone)
  for (let row = y1 - houseH + 3; row < y1 - 2; row += 3)
    px(p.ctx, houseX + 1, row, houseW - 2, 1, shade(stone, 0.86))
  outline(p.ctx, houseX, y1 - houseH, houseW, houseH)
  gableRoof(p, houseX, y1 - houseH, houseW, h * 0.26, hueShift('#56606a', (rng() - 0.5) * 14), 1)
  door(p, houseX + houseW * 0.45, y1, Math.max(4, houseW * 0.2), houseH * 0.5, '#3e2a1a')
  windowGlow(p, houseX + houseW * 0.75, y1 - houseH * 0.7, 3, 4)
  const towerH = h * 0.86
  wallTexture(p, towerX, y1 - towerH, towerW, towerH, shade(stone, 0.95))
  outline(p.ctx, towerX, y1 - towerH, towerW, towerH)
  crenellation(p, towerX, y1 - towerH, towerW, shade(stone, 0.9))
  windowGlow(p, towerX + towerW / 2 - 1, y1 - towerH * 0.72, 2, 4)
  windowGlow(p, towerX + towerW / 2 - 1, y1 - towerH * 0.4, 2, 3)
  cracks(p, houseX, y1 - houseH, houseW, houseH)
}

/** A timber-framed hall: plastered panels between dark posts, the upper floor jutting out over the lower. */
function paintTimberHall(p: P) {
  const { x0, y1, w, h, rng } = p
  const plaster = hueShift('#e2d6b6', (rng() - 0.5) * 10, 0.9, 0.94 + rng() * 0.08)
  const lowerH = h * 0.3
  const upperH = h * 0.28
  wallTexture(p, x0 + 1, y1 - lowerH, w - 2, lowerH, plaster)
  timberFrame(p, x0 + 1, y1 - lowerH, w - 2, lowerH)
  outline(p.ctx, x0 + 1, y1 - lowerH, w - 2, lowerH)
  const upperY = y1 - lowerH - upperH
  wallTexture(p, x0 - 1, upperY, w + 2, upperH, shade(plaster, 1.02))
  timberFrame(p, x0 - 1, upperY, w + 2, upperH)
  // Diagonal braces in the upper panels.
  for (let i = 0; i + 4 < w; i += 8) {
    for (let k = 0; k < Math.min(4, upperH - 1); k++)
      px(p.ctx, x0 + i + k, upperY + upperH - 1 - k, 1, 1, '#5a4028')
  }
  px(p.ctx, x0 - 1, upperY + upperH, w + 2, 1, '#4a3420')
  outline(p.ctx, x0 - 1, upperY, w + 2, upperH)
  gableRoof(p, x0 - 1, upperY, w + 2, h * 0.3, hueShift('#6e3a28', (rng() - 0.5) * 16))
  chimney(p, x0 + Math.round(w * (0.2 + rng() * 0.6)), upperY - h * 0.18, 6)
  door(p, x0 + w * (0.3 + rng() * 0.4), y1, Math.max(4, w * 0.12), lowerH * 0.8, '#40291a')
  const nWin = Math.max(2, Math.floor(w / 9))
  for (let i = 0; i < nWin; i++)
    windowGlow(p, x0 + 2 + (i * (w - 7)) / Math.max(1, nWin - 1), upperY + 2, 3, 3)
  cracks(p, x0, upperY, w, upperH + lowerH)
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
