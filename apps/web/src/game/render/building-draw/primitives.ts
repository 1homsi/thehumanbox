import { SHADOW } from '../art-palette'
import { PAD, PAD_BOT } from '../building-painters/kit'
import type { BuildingLike } from './types'

export function visualHash(building: BuildingLike, salt: number): number {
  let value =
    Math.imul((building.id ?? 0) + salt * 101, 2654435761) ^
    Math.imul(Math.floor(building.x) + salt, 73856093) ^
    Math.imul(Math.floor(building.y) - salt, 19349663)
  value ^= value >>> 16
  return (value >>> 0) / 4294967295
}

export function drawPixelLine(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  size = 1,
) {
  let x = Math.round(fromX)
  let y = Math.round(fromY)
  const targetX = Math.round(toX)
  const targetY = Math.round(toY)
  const dx = Math.abs(targetX - x)
  const sx = x < targetX ? 1 : -1
  const dy = -Math.abs(targetY - y)
  const sy = y < targetY ? 1 : -1
  let error = dx + dy
  const pixelSize = Math.max(1, Math.round(size))
  const offset = Math.floor(pixelSize / 2)

  while (true) {
    ctx.fillStyle = color
    ctx.fillRect(x - offset, y - offset, pixelSize, pixelSize)
    if (x === targetX && y === targetY) break
    const twiceError = error * 2
    if (twiceError >= dy) {
      error += dy
      x += sx
    }
    if (twiceError <= dx) {
      error += dx
      y += sy
    }
  }
}

/**
 * The flat shadow of a footprint with no sprite of its own (a building site, a ruin): one hard-edged,
 * translucent shape under the base that leans to the bottom-right, away from the light.
 */
export function drawBuildingShadow(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  w: number,
  h: number,
  tileSize: number,
) {
  const x = Math.round(px)
  const y = Math.round(py + h)
  const width = Math.max(1, Math.round(w))
  const reach = Math.max(2, Math.min(PAD, Math.round(tileSize * 0.5)))
  ctx.fillStyle = `rgba(${SHADOW.rgb[0]},${SHADOW.rgb[1]},${SHADOW.rgb[2]},${SHADOW.alpha})`
  for (let i = 0; i < PAD_BOT; i++) {
    // Each row further down is pushed further right: the shadow is a parallelogram, not a bar.
    const shift = Math.round((reach * (i + 1)) / PAD_BOT)
    ctx.fillRect(x + shift, y - 1 + i, width, 1)
  }
}

export function drawProgressBar(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  w: number,
  tileSize: number,
  progress: number,
  color: string,
) {
  const x = Math.round(px)
  const width = Math.max(3, Math.round(w))
  const height = Math.max(3, Math.round(tileSize * 0.18))
  const y = Math.round(py - Math.max(4, tileSize * 0.28))
  ctx.fillStyle = 'rgba(43, 33, 23, 0.9)'
  ctx.fillRect(x, y, width, height)
  ctx.fillStyle = color
  ctx.fillRect(
    x + 1,
    y + 1,
    Math.max(0, Math.round((width - 2) * Math.max(0, Math.min(1, progress)))),
    Math.max(1, height - 2),
  )
}
