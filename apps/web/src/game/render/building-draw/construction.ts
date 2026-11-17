import type { BuildingState } from '../../model/building-state'
import type { BuildingLike, BuildingVisualDetail } from './types'
import { PAD, PAD_BOT } from '../building-sprites'
import { visualHash } from './primitives'
import { normKind, resolveBuildingFootprint } from './footprints'
import { finishedSprite } from './finished-sprite'
import { C, hexOf } from '../pixel-art/palette.ts'

/** How far through the build the walls start to rise; the cleared plot and foundation come first. */
const RISE_FROM = 0.16
/** The chalk line marking out the planned building above the part already standing. */
const PLAN_LINE = hexOf(C.tan5)
/** Pips in the progress marker over a site seen up close. */
export const PROGRESS_PIPS = 5

const FRAME = hexOf(C.gold2)
const SCAFFOLD = hexOf(C.gold4)
const EARTH = hexOf(C.tan1)
const FOOTING_EDGE = hexOf(C.gold0)
const FOOTING = hexOf(C.grey6)
const FOOTING_LIGHT = hexOf(C.grey8)
const TIMBER = hexOf(C.gold3)
const TIMBER_DARK = hexOf(C.gold1)
const STONE = hexOf(C.grey5)
const STONE_LIGHT = hexOf(C.grey7)
const STAKE = hexOf(C.gold1)
const PIP_ON = hexOf(C.gold5)
const PIP_OFF = hexOf(C.tan4)

/**
 * A building under construction: a cleared plot and foundation, then the building itself rising
 * course by course, so each site already reads as the house, dock or temple it will be: its sprite is
 * revealed from the ground up under a dotted chalk outline of the whole. Scaffolding stands around the
 * rising part, and up close a row of pips shows how far along it is.
 */
export function drawConstructionSite(
  ctx: CanvasRenderingContext2D,
  building: BuildingLike,
  state: BuildingState,
  px: number,
  py: number,
  w: number,
  h: number,
  tileSize: number,
  detail: BuildingVisualDetail,
  nightFactor = 0,
) {
  const progress = Math.max(0, Math.min(1, state.constructionProgress))
  const x = Math.round(px)
  const y = Math.round(py)
  const width = Math.max(3, Math.round(w))
  const height = Math.max(3, Math.round(h))
  const groundY = y + height
  const foundationHeight = Math.max(2, Math.round(tileSize * 0.2))
  const foundationY = groundY - foundationHeight
  const foundationProgress = Math.min(1, Math.max(0.12, progress / 0.2))
  const foundationWidth = Math.max(2, Math.round(width * foundationProgress))
  const foundationX = x + Math.floor((width - foundationWidth) / 2)

  // Cleared earth and a foundation make even a zero-progress reservation
  // distinguishable from an operational building.
  ctx.fillStyle = EARTH
  ctx.fillRect(
    x,
    groundY - Math.max(2, Math.round(tileSize * 0.3)),
    width,
    Math.max(2, Math.round(tileSize * 0.3)),
  )
  ctx.fillStyle = FOOTING_EDGE
  ctx.fillRect(foundationX - 1, foundationY - 1, foundationWidth + 2, foundationHeight + 2)
  ctx.fillStyle = FOOTING
  ctx.fillRect(foundationX, foundationY, foundationWidth, foundationHeight)
  ctx.fillStyle = FOOTING_LIGHT
  ctx.fillRect(foundationX, foundationY, foundationWidth, 1)

  // Material stacks remain visible through the early build and disappear as
  // the shell consumes them.
  if (progress < 0.62) {
    const stackWidth = Math.max(2, Math.min(5, Math.round(tileSize * 0.26)))
    const stackX = x + 1 + Math.round(visualHash(building, 31) * Math.max(0, width - stackWidth - 2))
    const stackY = groundY - foundationHeight - 2
    ctx.fillStyle = TIMBER_DARK
    ctx.fillRect(stackX, stackY, stackWidth, 2)
    ctx.fillStyle = TIMBER
    ctx.fillRect(stackX, stackY - 1, stackWidth, 1)

    const stoneX = x + width - Math.max(3, Math.round(tileSize * 0.3))
    ctx.fillStyle = STONE
    ctx.fillRect(stoneX, groundY - foundationHeight - 2, 3, 2)
    ctx.fillStyle = STONE_LIGHT
    ctx.fillRect(stoneX + 1, groundY - foundationHeight - 3, 2, 1)
  }

  // The plot is staked out from the day it is marked.
  if (detail !== 'overview') drawPlotStakes(ctx, x, y, width, height, tileSize)

  // The planned shape shows as a dotted outline from the start, and the building rises into it.
  const rise = progress < RISE_FROM ? 0 : Math.min(1, (progress - RISE_FROM) / (1 - RISE_FROM))
  const kind = normKind(building.kind)
  const [fw, fh] = resolveBuildingFootprint(building)
  const sprite = finishedSprite(building, kind, fw, fh, tileSize, nightFactor, 1)
  let tops = { built: foundationY, plan: foundationY }
  if (sprite) tops = drawRisingSprite(ctx, sprite, px, py, w, h, rise)
  if (rise > 0 && detail !== 'overview') drawScaffold(ctx, x, width, tops.built, groundY, tileSize)

  if (detail === 'detail')
    drawProgressPips(ctx, px, w, Math.min(tops.built, tops.plan, y), tileSize, progress)
}

/** A stake at each corner of the plot with a string run between them. */
function drawPlotStakes(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  tileSize: number,
) {
  const stake = Math.max(2, Math.round(tileSize * 0.16))
  // The string: a dotted line of whole pixels, one on and two off.
  ctx.fillStyle = PLAN_LINE
  for (let i = 0; i < width; i += 3) {
    ctx.fillRect(x + i, y, 1, 1)
    ctx.fillRect(x + i, y + height - 1, 1, 1)
  }
  for (let j = 0; j < height; j += 3) {
    ctx.fillRect(x, y + j, 1, 1)
    ctx.fillRect(x + width - 1, y + j, 1, 1)
  }
  ctx.fillStyle = STAKE
  for (const [sx, sy] of [
    [x, y],
    [x + width - 1, y],
    [x, y + height - 1],
    [x + width - 1, y + height - 1],
  ]) {
    ctx.fillRect(sx, sy - stake + 1, 1, stake)
  }
}

/**
 * The finished sprite revealed from the ground up to `rise` of its height, under a faint copy of the
 * rest. Returns the canvas rows of the built top and of the planned top.
 */
function drawRisingSprite(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  px: number,
  py: number,
  w: number,
  h: number,
  rise: number,
): { built: number; plan: number } {
  const dx = Math.round(px - PAD)
  const dy = Math.round(py + h + PAD_BOT - sprite.height)
  const groundRow = sprite.height - PAD_BOT
  const contentTop = Math.min(groundRow - 1, spriteContentTop(sprite))
  const builtRows = rise <= 0 ? 0 : Math.max(1, Math.round((groundRow - contentTop) * rise))
  const builtTopRow = groundRow - builtRows

  if (builtTopRow > contentTop) {
    // The rest of the building as a dotted line along its outline, in whole solid pixels. A see-through
    // copy of the finished sprite read as a soft blurred ghost on the grass.
    const edge = spriteOutline(sprite)
    ctx.fillStyle = PLAN_LINE
    for (let i = 0; i < edge.length; i += 2) {
      const ex = edge[i]
      const ey = edge[i + 1]
      if (ey >= builtTopRow || (ex + ey) % 2 !== 0) continue
      ctx.fillRect(dx + ex, dy + ey, 1, 1)
    }
  }
  if (builtRows === 0) return { built: dy + groundRow, plan: dy + contentTop }
  // What stands so far, with the shadow it casts below the ground line.
  const below = sprite.height - builtTopRow
  ctx.drawImage(sprite, 0, builtTopRow, sprite.width, below, dx, dy + builtTopRow, sprite.width, below)
  // The course being laid: a timber beam along the top of the walls.
  if (rise < 1) {
    ctx.fillStyle = FRAME
    ctx.fillRect(Math.round(px), dy + builtTopRow, Math.max(1, Math.round(w)), 1)
  }
  return { built: dy + builtTopRow, plan: dy + contentTop }
}

/** Two poles beside the rising walls, with planks across at each lift, up to the working height. */
function drawScaffold(
  ctx: CanvasRenderingContext2D,
  x: number,
  width: number,
  top: number,
  groundY: number,
  tileSize: number,
) {
  const offset = Math.max(2, Math.round(tileSize * 0.15))
  const scaffoldTop = Math.min(groundY - 3, top - 2)
  ctx.fillStyle = SCAFFOLD
  ctx.fillRect(x - offset, scaffoldTop, 1, groundY - scaffoldTop)
  ctx.fillRect(x + width + offset - 1, scaffoldTop, 1, groundY - scaffoldTop)
  for (let row = groundY - 2; row >= scaffoldTop; row -= Math.max(5, Math.round(tileSize * 0.4))) {
    ctx.fillRect(x - offset, row, offset, 1)
    ctx.fillRect(x + width, row, offset, 1)
  }
  ctx.fillRect(x - offset, scaffoldTop, width + offset * 2, 1)
}

/** How many of `PROGRESS_PIPS` are lit at `progress`: one per fifth of the work done. */
export function litPips(progress: number): number {
  if (!Number.isFinite(progress)) return 0
  return Math.floor(Math.max(0, Math.min(1, progress)) * PROGRESS_PIPS)
}

/** A short row of square pips centred over the site, apart from each other, lit for each fifth of the work done. */
function drawProgressPips(
  ctx: CanvasRenderingContext2D,
  px: number,
  w: number,
  top: number,
  tileSize: number,
  progress: number,
) {
  const size = Math.max(2, Math.round(tileSize * 0.12))
  const gap = size + 1
  const total = PROGRESS_PIPS * size + (PROGRESS_PIPS - 1) * gap
  const x0 = Math.round(px + (w - total) / 2)
  const y = Math.round(top - size - 3)
  const lit = litPips(progress)
  for (let i = 0; i < PROGRESS_PIPS; i++) {
    const pipX = x0 + i * (size + gap)
    // An ink edge keeps each pip readable on light ground without joining them into a bar.
    ctx.fillStyle = FOOTING_EDGE
    ctx.fillRect(pipX - 1, y - 1, size + 2, size + 2)
    ctx.fillStyle = i < lit ? PIP_ON : PIP_OFF
    ctx.fillRect(pipX, y, size, size)
  }
}

const contentTops = new WeakMap<HTMLCanvasElement, number>()
const outlines = new WeakMap<HTMLCanvasElement, Int16Array>()
let scratch: CanvasRenderingContext2D | null = null

/** A sprite's pixels, read through the scratch canvas (the sprite canvases themselves are never read back). */
function spritePixels(sprite: HTMLCanvasElement): Uint8ClampedArray | null {
  if (!scratch) {
    const canvas = document.createElement('canvas')
    scratch = canvas.getContext('2d', { willReadFrequently: true })
  }
  if (!scratch) return null
  const { width, height } = sprite
  if (scratch.canvas.width < width || scratch.canvas.height < height) {
    scratch.canvas.width = Math.max(scratch.canvas.width, width)
    scratch.canvas.height = Math.max(scratch.canvas.height, height)
  }
  scratch.clearRect(0, 0, width, height)
  scratch.drawImage(sprite, 0, 0)
  return scratch.getImageData(0, 0, width, height).data
}

/**
 * The outline of a sprite's solid body, as x, y pairs: every solid pixel with an empty one beside it.
 * The cast shadow is see-through, so it is not part of the body. Read once per sprite.
 */
function spriteOutline(sprite: HTMLCanvasElement): Int16Array {
  const known = outlines.get(sprite)
  if (known) return known
  const out: number[] = []
  try {
    const data = spritePixels(sprite)
    if (data) {
      const { width, height } = sprite
      const solid = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < width && y < height && data[(y * width + x) * 4 + 3] >= 128
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          if (solid(x, y) && (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1)))
            out.push(x, y)
    }
  } catch {
    out.length = 0
  }
  const edge = Int16Array.from(out)
  outlines.set(sprite, edge)
  return edge
}

/**
 * The first row of a sprite with any opaque pixel, so a site rises through the building, not the
 * padding above it. Read once per sprite through a scratch canvas kept for pixel reads, so the sprite
 * canvases themselves are never read back.
 */
function spriteContentTop(sprite: HTMLCanvasElement): number {
  const known = contentTops.get(sprite)
  if (known !== undefined) return known
  let top = 0
  try {
    const data = spritePixels(sprite)
    if (data) {
      const { width, height } = sprite
      top = height
      for (let row = 0; row < height && top === height; row++) {
        for (let col = 0; col < width; col++) {
          if (data[(row * width + col) * 4 + 3] > 24) {
            top = row
            break
          }
        }
      }
      if (top === height) top = 0
    }
  } catch {
    top = 0
  }
  contentTops.set(sprite, top)
  return top
}
