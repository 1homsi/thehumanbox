import type { BuildingState } from '../../model/building-state'
import type { BuildingLike, BuildingVisualDetail } from './types'
import { drawPixelLine, visualHash } from './primitives'

/** Ticks an abandoned ruin lies before it crumbles (the sim's `vacancy::CRUMBLE_TICKS`). */
export const RUIN_CRUMBLE_TICKS = 12_000

/** What a ruin's broken walls are made of. */
export function ruinMaterial(kind: string, tier = 0): { wall: string; shade: string; top: string } {
  const k = kind.toLowerCase()
  if (/^(hut|tent|cabin|lean_?to|longhouse|yurt)/.test(k) || (tier <= 1 && /house|home/.test(k)))
    return { wall: '#7a5636', shade: '#553a24', top: '#9a7449' }
  if (
    tier >= 5 ||
    /apartment|skyscraper|factory|tower|plant|station|port|lab|office|datacenter|hospital/.test(k)
  )
    return { wall: '#8d9196', shade: '#62666b', top: '#b1b5b9' }
  return { wall: '#8b8173', shade: '#625a50', top: '#aaa090' }
}

export function drawRuinedBuilding(
  ctx: CanvasRenderingContext2D,
  building: BuildingLike,
  state: BuildingState,
  px: number,
  py: number,
  w: number,
  h: number,
  tileSize: number,
  detail: BuildingVisualDetail,
) {
  ctx.save()

  const x = Math.round(px)
  const y = Math.round(py)
  const width = Math.max(3, Math.round(w))
  const height = Math.max(3, Math.round(h))
  const bottom = y + height
  // 0 when it has just fallen in, 1 by the time an abandoned ruin would
  // crumble away: the walls wear down and grass creeps over the rubble.
  const age = Math.max(0, Math.min(1, building.ruinAge ?? 0))
  const material = ruinMaterial(building.kind, building.tier)
  const unit = Math.max(1, Math.round(tileSize / 8))

  // The old floor: trampled earth where the building stood.
  const floorTop = y + Math.round(height * 0.55)
  ctx.fillStyle = 'rgba(58, 44, 32, 0.78)'
  ctx.fillRect(x + unit, floorTop, Math.max(1, width - unit * 2), bottom - floorTop)
  ctx.fillStyle = 'rgba(36, 27, 20, 0.55)'
  ctx.fillRect(x + unit, bottom - unit, Math.max(1, width - unit * 2), unit)

  if (detail !== 'overview') {
    // Broken wall stubs at either end, with ragged tops, worn lower with age.
    const wear = 1 - age * 0.45
    const stubs: Array<[number, number, number]> = [
      [x, Math.round(width * 0.24), 0.62],
      [x + width - Math.round(width * 0.2), Math.round(width * 0.2), 0.42],
    ]
    if (width > tileSize * 1.5) stubs.push([x + Math.round(width * 0.46), Math.round(width * 0.12), 0.3])
    stubs.forEach(([sx, sw, tall], i) => {
      const stubW = Math.max(unit * 2, sw)
      const stubH = Math.max(
        unit * 2,
        Math.round(height * tall * wear * (0.8 + visualHash(building, 40 + i) * 0.4)),
      )
      const top = bottom - stubH
      ctx.fillStyle = material.wall
      ctx.fillRect(sx, top, stubW, stubH)
      ctx.fillStyle = material.shade
      ctx.fillRect(sx + stubW - unit, top, unit, stubH)
      // Ragged top: a few bricks missing, a few standing proud.
      for (let c = 0; c < stubW; c += unit * 2) {
        const bite = visualHash(building, 50 + i * 7 + c)
        if (bite < 0.4) {
          // A missing brick: the stub's own shadow shows through.
          ctx.fillStyle = 'rgba(30, 22, 16, 0.9)'
          ctx.fillRect(sx + c, top, Math.min(unit * 2, stubW - c), unit)
        } else {
          ctx.fillStyle = material.top
          ctx.fillRect(sx + c, top, Math.min(unit * 2, stubW - c), unit)
        }
      }
      // Mortar lines on stone and concrete.
      if (material.wall !== '#7a5636') {
        ctx.fillStyle = material.shade
        for (let r = top + unit * 3; r < bottom - unit; r += unit * 3) ctx.fillRect(sx, r, stubW - unit, 1)
      }
    })

    // Fallen roof beams lying across the rubble.
    const beamY = bottom - Math.round(height * 0.22)
    drawPixelLine(
      ctx,
      x + width * 0.18,
      beamY - height * 0.16,
      x + width * 0.62,
      beamY + height * 0.08,
      '#4a3322',
      Math.max(2, unit * 2),
    )
    drawPixelLine(
      ctx,
      x + width * 0.4,
      beamY + height * 0.1,
      x + width * 0.86,
      beamY - height * 0.1,
      '#5b3f29',
      Math.max(1, unit),
    )
  }

  // A heap of rubble in the old floor.
  const rubbleCount = Math.min(12, 5 + Math.ceil((w + h) / Math.max(1, tileSize)))
  const rubbleColors = [material.wall, material.shade, '#5a4c40', material.top]
  for (let i = 0; i < rubbleCount; i++) {
    const rx = visualHash(building, i * 3 + 1)
    const ry = visualHash(building, i * 3 + 2)
    const rs = visualHash(building, i * 3 + 3)
    const rw = Math.max(2, Math.round(tileSize * (0.16 + rs * 0.22)))
    const rh = Math.max(2, Math.round(tileSize * (0.1 + (1 - rs) * 0.14)))
    const rubbleX = x + Math.round(rx * Math.max(0, width - rw))
    const rubbleY = floorTop + Math.round(ry * Math.max(0, bottom - floorTop - rh))
    ctx.fillStyle = rubbleColors[i % rubbleColors.length]!
    ctx.fillRect(rubbleX, rubbleY, rw, rh)
    ctx.fillStyle = 'rgba(255, 240, 210, 0.18)'
    ctx.fillRect(rubbleX, rubbleY, Math.max(1, rw - 1), 1)
  }

  // Grass and weeds take the ruin back as the years pass.
  const tufts = Math.round(age * 10)
  for (let i = 0; i < tufts; i++) {
    const tx = x + Math.round(visualHash(building, 90 + i) * Math.max(0, width - unit * 2))
    const ty =
      floorTop + Math.round(visualHash(building, 110 + i) * Math.max(0, bottom - floorTop - unit * 2))
    ctx.fillStyle = i % 3 === 0 ? '#7aa34a' : '#5f8a3a'
    ctx.fillRect(tx, ty, unit * 2, unit)
    ctx.fillRect(tx + unit, ty - unit, unit, unit)
  }

  if (state.isRepairing && detail !== 'overview') {
    const scaffoldTop = y + Math.max(2, Math.round(height * 0.12))
    const left = x + Math.max(1, Math.round(width * 0.18))
    const right = x + width - Math.max(2, Math.round(width * 0.18))
    ctx.fillStyle = '#efc76d'
    ctx.fillRect(left, scaffoldTop, 1, bottom - scaffoldTop)
    ctx.fillRect(right, scaffoldTop, 1, bottom - scaffoldTop)
    for (let row = scaffoldTop; row < bottom; row += Math.max(4, Math.round(tileSize * 0.35))) {
      ctx.fillRect(left, row, Math.max(1, right - left + 1), 1)
    }
  }
  ctx.restore()
}

export function drawBuildingDamage(
  ctx: CanvasRenderingContext2D,
  building: BuildingLike,
  state: BuildingState,
  px: number,
  py: number,
  w: number,
  h: number,
  tileSize: number,
  detail: BuildingVisualDetail,
) {
  if (!state.isDamaged) return
  const severity = Math.max(state.damage, 1 - state.integrity)

  ctx.save()

  if (detail !== 'overview') {
    ctx.strokeStyle = severity > 0.55 ? '#2b1712' : '#493126'
    ctx.lineWidth = Math.max(1.2, tileSize * (0.055 + severity * 0.045))
    ctx.lineJoin = 'bevel'
    const crackX = px + w * (0.28 + visualHash(building, 71) * 0.4)
    ctx.beginPath()
    ctx.moveTo(crackX, py + h * 0.08)
    ctx.lineTo(crackX - w * 0.12, py + h * 0.34)
    ctx.lineTo(crackX + w * 0.08, py + h * 0.53)
    ctx.lineTo(crackX - w * 0.16, py + h * 0.82)
    ctx.moveTo(crackX - w * 0.05, py + h * 0.44)
    ctx.lineTo(crackX - w * 0.25, py + h * 0.58)
    ctx.stroke()
  }

  // Wear belongs to the structure, not a floating health meter.
  if (severity > 0.35) {
    const chips = Math.min(7, Math.ceil(severity * 7))
    for (let i = 0; i < chips; i++) {
      const x = Math.round(px + w * (0.12 + visualHash(building, 90 + i) * 0.76))
      const y = Math.round(py + h * (0.55 + visualHash(building, 110 + i) * 0.35))
      const size = Math.max(2, Math.round(tileSize * (0.08 + severity * 0.1)))
      ctx.fillStyle = '#665546'
      ctx.fillRect(x, y, size + 1, size)
      ctx.fillStyle = '#a39378'
      ctx.fillRect(x, y, size, 1)
      if (severity > 0.55) {
        ctx.fillStyle = '#796a57'
        ctx.fillRect(x, Math.round(py + h + 1), size, Math.max(1, size - 1))
      }
    }
  }

  if (state.isRepairing && detail !== 'overview') {
    // Timber scaffolding and stacked supplies belong on the site itself.
    const left = Math.round(px - 2)
    const top = Math.round(py + h * 0.15)
    const bottom = Math.round(py + h)
    const width = Math.max(5, Math.round(w * 0.4))
    ctx.fillStyle = '#805631'
    ctx.fillRect(left, top, 2, bottom - top)
    ctx.fillRect(left + width, top, 2, bottom - top)
    for (let y = top + 3; y < bottom; y += 5) {
      ctx.fillStyle = '#b68c54'
      ctx.fillRect(left, y, width + 2, 2)
    }
    ctx.fillStyle = '#aa9577'
    ctx.fillRect(left + width + 4, bottom - 3, 5, 3)
  }
  ctx.restore()
}
