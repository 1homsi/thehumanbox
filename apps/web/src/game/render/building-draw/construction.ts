import type { BuildingState } from '../../model/building-state'
import type { BuildingLike, BuildingVisualDetail } from './types'
import { hasBuildingSprite, PAD, PAD_BOT } from '../building-sprites'
import { drawPixelLine, visualHash } from './primitives'
import { normKind, resolveBuildingFootprint } from './footprints'
import { roofColor, wallColor } from './colors'
import { finishedSprite } from './finished-sprite'

/** How far through the build the walls start to rise; the cleared plot and foundation come first. */
const RISE_FROM = 0.16
/** Alpha of the planned building above the part already standing. */
const PLAN_ALPHA = 0.2
/** Pips in the progress marker over a site seen up close. */
export const PROGRESS_PIPS = 5

const FRAME = '#76502f'
const FRAME_LIGHT = '#a87945'
const BRACE = '#5d3c25'
const SCAFFOLD = '#c99a52'

/**
 * A building under construction: a cleared plot and foundation, then the building itself rising
 * course by course, so each site already reads as the house, dock or temple it will be. A kind with
 * a sprite reveals that sprite from the ground up under a faint outline of the whole; a kind drawn
 * by hand gets a timber frame in its own wall and roof colours. Scaffolding stands around the
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
  ctx.fillStyle = '#493727'
  ctx.fillRect(
    x,
    groundY - Math.max(2, Math.round(tileSize * 0.3)),
    width,
    Math.max(2, Math.round(tileSize * 0.3)),
  )
  ctx.fillStyle = '#30251d'
  ctx.fillRect(foundationX - 1, foundationY - 1, foundationWidth + 2, foundationHeight + 2)
  ctx.fillStyle = '#807566'
  ctx.fillRect(foundationX, foundationY, foundationWidth, foundationHeight)
  ctx.fillStyle = '#a59a87'
  ctx.fillRect(foundationX, foundationY, foundationWidth, 1)

  // Material stacks remain visible through the early build and disappear as
  // the shell consumes them.
  if (progress < 0.62) {
    const stackWidth = Math.max(2, Math.min(5, Math.round(tileSize * 0.26)))
    const stackX = x + 1 + Math.round(visualHash(building, 31) * Math.max(0, width - stackWidth - 2))
    const stackY = groundY - foundationHeight - 2
    ctx.fillStyle = '#4a2f1d'
    ctx.fillRect(stackX, stackY, stackWidth, 2)
    ctx.fillStyle = '#b07943'
    ctx.fillRect(stackX, stackY - 1, stackWidth, 1)

    const stoneX = x + width - Math.max(3, Math.round(tileSize * 0.3))
    ctx.fillStyle = '#5c554d'
    ctx.fillRect(stoneX, groundY - foundationHeight - 2, 3, 2)
    ctx.fillStyle = '#81766a'
    ctx.fillRect(stoneX + 1, groundY - foundationHeight - 3, 2, 1)
  }

  // The plot is staked out from the day it is marked.
  if (detail !== 'overview') drawPlotStakes(ctx, x, y, width, height, tileSize)

  // A kind with a sprite shows its planned shape faintly from the start, then rises into it; one
  // drawn by hand puts up a timber frame once the foundation is down.
  const rise = progress < RISE_FROM ? 0 : Math.min(1, (progress - RISE_FROM) / (1 - RISE_FROM))
  const kind = normKind(building.kind)
  const [fw, fh] = resolveBuildingFootprint(building)
  const sprite = hasBuildingSprite(kind)
    ? finishedSprite(building, kind, fw, fh, tileSize, nightFactor, 1)
    : null
  let tops = { built: foundationY, plan: foundationY }
  if (sprite) {
    tops = drawRisingSprite(ctx, sprite, px, py, w, h, rise)
  } else if (progress >= RISE_FROM) {
    tops = drawTimberShell(
      ctx,
      kind,
      x,
      width,
      height,
      foundationY,
      foundationHeight,
      tileSize,
      progress,
      rise,
    )
  }
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
  ctx.fillStyle = 'rgba(232, 214, 170, 0.55)'
  ctx.fillRect(x, y, width, 1)
  ctx.fillRect(x, y + height - 1, width, 1)
  ctx.fillRect(x, y, 1, height)
  ctx.fillRect(x + width - 1, y, 1, height)
  ctx.fillStyle = '#6b4a2b'
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
    ctx.save()
    ctx.globalAlpha = PLAN_ALPHA
    ctx.drawImage(
      sprite,
      0,
      contentTop,
      sprite.width,
      builtTopRow - contentTop,
      dx,
      dy + contentTop,
      sprite.width,
      builtTopRow - contentTop,
    )
    ctx.restore()
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

/**
 * A timber frame for a kind with no sprite: posts and beams in the kind's own wall colour fill
 * upward, and the roof's rafters go up in its roof colour near the end.
 */
function drawTimberShell(
  ctx: CanvasRenderingContext2D,
  kind: string,
  x: number,
  width: number,
  height: number,
  foundationY: number,
  foundationHeight: number,
  tileSize: number,
  progress: number,
  rise: number,
): { built: number; plan: number } {
  const maximumShellHeight = Math.max(4, height - foundationHeight)
  const shellHeight = Math.max(3, Math.round(maximumShellHeight * (0.18 + rise * 0.82)))
  const shellTop = foundationY - shellHeight
  const plan = foundationY - maximumShellHeight

  // Unfinished walls fill upward in courses; exposed posts and braces keep it
  // visibly under construction even at 99%.
  if (progress >= 0.36) {
    const wallInset = Math.max(2, Math.round(tileSize * 0.14))
    const wallTop = Math.round(
      foundationY - shellHeight * Math.min(0.9, Math.max(0.15, (progress - 0.28) / 0.72)),
    )
    ctx.fillStyle = wallColor(kind)
    ctx.fillRect(
      x + wallInset,
      wallTop,
      Math.max(1, width - wallInset * 2),
      Math.max(1, foundationY - wallTop),
    )
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    for (let row = wallTop + 3; row < foundationY; row += 4) {
      ctx.fillRect(x + wallInset, row, Math.max(1, width - wallInset * 2), 1)
    }
  }

  const postWidth = Math.max(1, Math.round(tileSize * 0.1))
  const postCount = Math.max(2, Math.min(5, Math.ceil(width / Math.max(8, tileSize))))
  for (let i = 0; i < postCount; i++) {
    const postX = Math.round(x + (i * (width - postWidth)) / Math.max(1, postCount - 1))
    ctx.fillStyle = FRAME
    ctx.fillRect(postX, shellTop, postWidth, foundationY - shellTop)
    ctx.fillStyle = FRAME_LIGHT
    ctx.fillRect(postX, shellTop, 1, foundationY - shellTop)
  }

  const beamStep = Math.max(5, Math.round(tileSize * 0.42))
  for (let beamY = foundationY - 2; beamY >= shellTop; beamY -= beamStep) {
    ctx.fillStyle = FRAME
    ctx.fillRect(x, beamY, width, Math.max(1, postWidth))
  }
  drawPixelLine(ctx, x, foundationY - 1, x + width - 1, shellTop, BRACE)
  drawPixelLine(ctx, x + width - 1, foundationY - 1, x, shellTop, BRACE)

  if (progress >= 0.78) {
    const rafter = roofColor(kind) ?? FRAME
    const roofPeakY = shellTop - Math.max(3, Math.round(tileSize * 0.28))
    drawPixelLine(ctx, x - 1, shellTop, x + Math.floor(width / 2), roofPeakY, rafter, postWidth)
    drawPixelLine(ctx, x + Math.floor(width / 2), roofPeakY, x + width, shellTop, rafter, postWidth)
    return { built: roofPeakY, plan: Math.min(plan, roofPeakY) }
  }
  return { built: shellTop, plan }
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
    // A one-pixel drop shadow keeps each pip readable on light ground without joining them into a bar.
    ctx.fillStyle = 'rgba(28, 21, 15, 0.7)'
    ctx.fillRect(pipX + 1, y + 1, size, size)
    ctx.fillStyle = i < lit ? '#f0c55a' : '#cdbb94'
    ctx.fillRect(pipX, y, size, size)
  }
}

const contentTops = new WeakMap<HTMLCanvasElement, number>()
let scratch: CanvasRenderingContext2D | null = null

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
    if (!scratch) {
      const canvas = document.createElement('canvas')
      scratch = canvas.getContext('2d', { willReadFrequently: true })
    }
    if (scratch) {
      const { width, height } = sprite
      if (scratch.canvas.width < width || scratch.canvas.height < height) {
        scratch.canvas.width = Math.max(scratch.canvas.width, width)
        scratch.canvas.height = Math.max(scratch.canvas.height, height)
      }
      scratch.clearRect(0, 0, width, height)
      scratch.drawImage(sprite, 0, 0)
      const data = scratch.getImageData(0, 0, width, height).data
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
