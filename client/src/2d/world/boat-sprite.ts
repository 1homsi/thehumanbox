/** Pixel hulls share the world's warm wood palette and need no extra textures. */
export function drawBoat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
  moving: boolean,
  building = false,
) {
  x = Math.round(x)
  y = Math.round(y)
  if (moving) {
    ctx.fillStyle = '#99c6c6'
    const wake = Math.floor(time / 180) % 3
    ctx.fillRect(x - 12 - wake, y + 4, 5, 1)
    ctx.fillRect(x + 9 + wake, y + 3, 4, 1)
  }
  ctx.fillStyle = '#38271d'
  ctx.fillRect(x - 10, y + 1, 20, 4)
  ctx.fillRect(x - 8, y + 5, 16, 2)
  ctx.fillStyle = '#a07843'
  ctx.fillRect(x - 9, y, 18, 3)
  ctx.fillStyle = '#d0a668'
  ctx.fillRect(x - 7, y - 1, 14, 1)
  ctx.fillStyle = '#5a3d27'
  ctx.fillRect(x - 5, y, 2, 4)
  ctx.fillRect(x + 4, y, 2, 4)
  if (building) return
  const stroke = moving ? Math.floor(time / 220) % 2 : 0
  ctx.fillStyle = '#c39a5c'
  ctx.fillRect(x - 13 + stroke * 2, y - 2, 8, 1)
  ctx.fillRect(x + 5, y + 3 + stroke, 8, 1)
  ctx.fillRect(x - 14 + stroke * 2, y - 3, 3, 3)
  ctx.fillRect(x + 12, y + 2 + stroke, 3, 3)
}
