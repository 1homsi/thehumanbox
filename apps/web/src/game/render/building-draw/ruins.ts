import type { BuildingState } from '../../model/building-state'
import type { BuildingLike, BuildingVisualDetail } from './types'
import { drawPixelLine, visualHash } from './primitives'
import { C, hexOf } from '../pixel-art/palette.ts'

/** Ticks an abandoned ruin lies before it crumbles (the sim's `vacancy::CRUMBLE_TICKS`). */
export const RUIN_CRUMBLE_TICKS = 12_000

const INK = hexOf(C.gold0)
export const FOUNDATIONS_AGE = 0.5
const FLOOR = hexOf(C.tan1)
const FLOOR_EDGE = hexOf(C.tan0)
const BEAM = hexOf(C.gold1)
const BEAM_LIGHT = hexOf(C.gold2)
const RUBBLE_DARK = hexOf(C.grey4)
const GRASS = hexOf(C.green3)
const GRASS_DARK = hexOf(C.green2)
const SCAFFOLD = hexOf(C.gold4)
const SCAFFOLD_DARK = hexOf(C.gold2)
const SUPPLIES = hexOf(C.tan3)

const WOOD = { wall: hexOf(C.tan2), shade: hexOf(C.tan1), top: hexOf(C.tan3) }
const CONCRETE = { wall: hexOf(C.grey7), shade: hexOf(C.grey5), top: hexOf(C.grey8) }
const STONE = { wall: hexOf(C.grey6), shade: hexOf(C.grey5), top: hexOf(C.grey7) }

/** What a ruin's broken walls are made of: timber for the first homes, concrete for the modern age, else stone. */
export function ruinMaterial(kind: string, tier = 0): { wall: string; shade: string; top: string } {
  const k = kind.toLowerCase()
  if (/^(hut|tent|cabin|lean_?to|longhouse|yurt)/.test(k) || (tier <= 1 && /house|home/.test(k))) return WOOD
  if (
    tier >= 5 ||
    /apartment|skyscraper|factory|tower|plant|station|port|lab|office|datacenter|hospital/.test(k)
  )
    return CONCRETE
  return STONE
}

/**
 * A fallen building: the trodden floor where it stood, stubs of wall with broken tops (outlined in the same
 * ink as a standing building), roof beams lying across the rubble, and grass taking it back as it ages.
 * Whole pixels in the map's palette throughout.
 */
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
  const x = Math.round(px)
  const y = Math.round(py)
  const width = Math.max(3, Math.round(w))
  const height = Math.max(3, Math.round(h))
  const bottom = y + height
  // 0 when it has just fallen in, 1 by the time an abandoned ruin would crumble away.
  const age = Math.max(0, Math.min(1, building.ruinAge ?? 0))
  const material = ruinMaterial(building.kind, building.tier)
  const unit = Math.max(1, Math.round(tileSize / 8))

  // The old floor: trampled earth where the building stood.
  const floorTop = y + Math.round(height * 0.55)
  ctx.fillStyle = FLOOR
  ctx.fillRect(x + unit, floorTop, Math.max(1, width - unit * 2), bottom - floorTop)
  ctx.fillStyle = FLOOR_EDGE
  ctx.fillRect(x + unit, bottom - unit, Math.max(1, width - unit * 2), unit)

  if (detail !== 'overview' && age >= FOUNDATIONS_AGE) {
    ctx.fillStyle = INK
    ctx.fillRect(x, floorTop - unit, width, unit)
    ctx.fillRect(x, bottom - unit, width, unit)
    ctx.fillRect(x, floorTop - unit, unit, bottom - floorTop + unit)
    ctx.fillRect(x + width - unit, floorTop - unit, unit, bottom - floorTop + unit)
    for (let c = unit; c < width - unit; c += unit * 2) {
      const gone = visualHash(building, 60 + c) < age * 0.6
      ctx.fillStyle = gone ? GRASS_DARK : material.top
      ctx.fillRect(x + c, floorTop - unit, unit, unit)
    }
  } else if (detail !== 'overview') {
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
      ctx.fillStyle = INK
      ctx.fillRect(sx - 1, top - 1, stubW + 2, stubH + 1)
      ctx.fillStyle = material.wall
      ctx.fillRect(sx, top, stubW, stubH)
      ctx.fillStyle = material.shade
      ctx.fillRect(sx + stubW - unit, top, unit, stubH)
      // The broken top: a step down every other block, so the wall ends in a stair, not a line.
      for (let c = 0; c < stubW; c += unit * 2) {
        const gone = visualHash(building, 50 + i * 7 + c) < 0.4
        ctx.fillStyle = gone ? INK : material.top
        ctx.fillRect(sx + c, top, Math.min(unit * 2, stubW - c), unit)
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
      BEAM,
      Math.max(2, unit * 2),
    )
    drawPixelLine(
      ctx,
      x + width * 0.4,
      beamY + height * 0.1,
      x + width * 0.86,
      beamY - height * 0.1,
      BEAM_LIGHT,
      Math.max(1, unit),
    )
  }

  // A heap of rubble on the old floor: blocks with a lit top edge.
  const rubbleCount = Math.min(12, 5 + Math.ceil((w + h) / Math.max(1, tileSize)))
  const rubbleColors = [material.wall, material.shade, RUBBLE_DARK, material.top]
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
    ctx.fillStyle = material.top
    ctx.fillRect(rubbleX, rubbleY, Math.max(1, rw - 1), 1)
  }

  // Grass and weeds take the ruin back as the years pass.
  const tufts = Math.round(age * 10)
  for (let i = 0; i < tufts; i++) {
    const tx = x + Math.round(visualHash(building, 90 + i) * Math.max(0, width - unit * 2))
    const ty =
      floorTop + Math.round(visualHash(building, 110 + i) * Math.max(0, bottom - floorTop - unit * 2))
    ctx.fillStyle = i % 3 === 0 ? GRASS : GRASS_DARK
    ctx.fillRect(tx, ty, unit * 2, unit)
    ctx.fillRect(tx + unit, ty - unit, unit, unit)
  }

  if (state.isRepairing && detail !== 'overview') {
    const scaffoldTop = y + Math.max(2, Math.round(height * 0.12))
    const left = x + Math.max(1, Math.round(width * 0.18))
    const right = x + width - Math.max(2, Math.round(width * 0.18))
    ctx.fillStyle = SCAFFOLD
    ctx.fillRect(left, scaffoldTop, 1, bottom - scaffoldTop)
    ctx.fillRect(right, scaffoldTop, 1, bottom - scaffoldTop)
    for (let row = scaffoldTop; row < bottom; row += Math.max(4, Math.round(tileSize * 0.35))) {
      ctx.fillRect(left, row, Math.max(1, right - left + 1), 1)
    }
  }
}

/**
 * Damage on a standing building. A badly worn sprite already carries its cracks (see `wornOn`); this adds
 * what lies round it: stones fallen at its foot, and the repair crew's scaffold and supplies.
 */
export function drawBuildingDamage(
  ctx: CanvasRenderingContext2D,
  building: BuildingLike,
  state: BuildingState,
  px: number,
  py: number,
  w: number,
  h: number,
  _tileSize: number,
  detail: BuildingVisualDetail,
) {
  if (!state.isDamaged) return
  const severity = Math.max(state.damage, 1 - state.integrity)

  // Wear belongs to the structure, not a floating health meter: fallen stones along the foot of the wall.
  if (severity > 0.35) {
    const chips = Math.min(7, Math.ceil(severity * 7))
    for (let i = 0; i < chips; i++) {
      const x = Math.round(px + w * (0.12 + visualHash(building, 90 + i) * 0.76))
      const y = Math.round(py + h - 2 + (i % 2))
      const size = severity > 0.55 ? 2 : 1
      ctx.fillStyle = INK
      ctx.fillRect(x - 1, y, size + 2, size)
      ctx.fillStyle = i % 2 ? STONE.wall : STONE.top
      ctx.fillRect(x, y, size, size)
    }
  }

  if (state.isRepairing && detail !== 'overview') {
    // Timber scaffolding and stacked supplies belong on the site itself.
    const left = Math.round(px - 2)
    const top = Math.round(py + h * 0.15)
    const bottom = Math.round(py + h)
    const width = Math.max(5, Math.round(w * 0.4))
    ctx.fillStyle = SCAFFOLD_DARK
    ctx.fillRect(left, top, 1, bottom - top)
    ctx.fillRect(left + width, top, 1, bottom - top)
    ctx.fillStyle = SCAFFOLD
    for (let y = top + 3; y < bottom; y += 5) ctx.fillRect(left, y, width + 1, 1)
    ctx.fillStyle = INK
    ctx.fillRect(left + width + 3, bottom - 4, 6, 4)
    ctx.fillStyle = SUPPLIES
    ctx.fillRect(left + width + 4, bottom - 3, 4, 3)
  }
}
