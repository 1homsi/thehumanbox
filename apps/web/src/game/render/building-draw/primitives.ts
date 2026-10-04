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
  const outerInset = Math.min(Math.floor(width / 4), Math.max(1, Math.round(tileSize * 0.12)))
  const innerInset = Math.min(Math.floor(width / 3), Math.max(2, Math.round(tileSize * 0.24)))

  // Three hard-edged bands read as a ground shadow without blurring adjacent
  // sprites or introducing sub-pixel filtering into the pixel-art layer.
  ctx.fillStyle = 'rgba(15, 11, 9, 0.18)'
  ctx.fillRect(x, y - 1, width, Math.max(2, Math.round(tileSize * 0.24)))
  ctx.fillStyle = 'rgba(15, 11, 9, 0.28)'
  ctx.fillRect(
    x + outerInset,
    y - 2,
    Math.max(1, width - outerInset * 2),
    Math.max(2, Math.round(tileSize * 0.18)),
  )
  ctx.fillStyle = 'rgba(15, 11, 9, 0.38)'
  ctx.fillRect(
    x + innerInset,
    y - 2,
    Math.max(1, width - innerInset * 2),
    Math.max(1, Math.round(tileSize * 0.1)),
  )
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
  ctx.fillStyle = 'rgba(18, 12, 10, 0.9)'
  ctx.fillRect(x, y, width, height)
  ctx.fillStyle = color
  ctx.fillRect(
    x + 1,
    y + 1,
    Math.max(0, Math.round((width - 2) * Math.max(0, Math.min(1, progress)))),
    Math.max(1, height - 2),
  )
}
