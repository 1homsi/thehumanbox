import type { BuildingState } from '../../model/building-state'
import type { BuildingLike, BuildingVisualDetail } from './types'
import { drawPixelLine, drawProgressBar, visualHash } from './primitives'

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

  if (progress >= 0.16) {
    const shellProgress = Math.min(1, (progress - 0.16) / 0.84)
    const maximumShellHeight = Math.max(4, height - foundationHeight)
    const shellHeight = Math.max(3, Math.round(maximumShellHeight * (0.18 + shellProgress * 0.82)))
    const shellTop = foundationY - shellHeight
    const frameColor = '#76502f'
    const highlight = '#a87945'

    // Unfinished masonry fills upward in discrete bands; exposed posts and
    // cross-braces keep it visibly under construction even at 99%.
    if (progress >= 0.36) {
      const wallInset = Math.max(2, Math.round(tileSize * 0.14))
      const wallTop = Math.round(
        foundationY - shellHeight * Math.min(0.9, Math.max(0.15, (progress - 0.28) / 0.72)),
      )
      ctx.fillStyle = '#756c5d'
      ctx.fillRect(
        x + wallInset,
        wallTop,
        Math.max(1, width - wallInset * 2),
        Math.max(1, foundationY - wallTop),
      )
      ctx.fillStyle = '#918676'
      for (let row = wallTop; row < foundationY; row += 4) {
        ctx.fillRect(x + wallInset, row, Math.max(1, width - wallInset * 2), 1)
      }
    }

    const postWidth = Math.max(1, Math.round(tileSize * 0.1))
    const postCount = Math.max(2, Math.min(5, Math.ceil(width / Math.max(8, tileSize))))
    for (let i = 0; i < postCount; i++) {
      const postX = Math.round(x + (i * (width - postWidth)) / Math.max(1, postCount - 1))
      ctx.fillStyle = frameColor
      ctx.fillRect(postX, shellTop, postWidth, foundationY - shellTop)
      ctx.fillStyle = highlight
      ctx.fillRect(postX, shellTop, 1, foundationY - shellTop)
    }

    const beamStep = Math.max(5, Math.round(tileSize * 0.42))
    for (let beamY = foundationY - 2; beamY >= shellTop; beamY -= beamStep) {
      ctx.fillStyle = frameColor
      ctx.fillRect(x, beamY, width, Math.max(1, postWidth))
    }
    drawPixelLine(ctx, x, foundationY - 1, x + width - 1, shellTop, '#5d3c25')
    drawPixelLine(ctx, x + width - 1, foundationY - 1, x, shellTop, '#5d3c25')

    if (progress >= 0.78) {
      const roofPeakY = Math.max(y, shellTop - Math.max(3, Math.round(tileSize * 0.28)))
      drawPixelLine(ctx, x - 1, shellTop, x + Math.floor(width / 2), roofPeakY, frameColor, postWidth)
      drawPixelLine(ctx, x + Math.floor(width / 2), roofPeakY, x + width, shellTop, frameColor, postWidth)
    }

    if (detail !== 'overview') {
      const scaffoldOffset = Math.max(2, Math.round(tileSize * 0.15))
      const scaffoldTop = Math.max(y, shellTop - 2)
      ctx.fillStyle = '#c99a52'
      ctx.fillRect(x - scaffoldOffset, scaffoldTop, 1, groundY - scaffoldTop)
      ctx.fillRect(x + width + scaffoldOffset - 1, scaffoldTop, 1, groundY - scaffoldTop)
      for (let row = groundY - 2; row >= scaffoldTop; row -= Math.max(5, Math.round(tileSize * 0.4))) {
        ctx.fillRect(x - scaffoldOffset, row, width + scaffoldOffset * 2, 1)
      }
    }
  }

  if (detail === 'detail') {
    drawProgressBar(ctx, px, py, w, tileSize, progress, '#e7b94f')
  }
}
