import { TILE } from '../../../model/palette'

/** One farm tile. Painted with its top-left at (x, y); also used to bake the tile into a sprite atlas. */
export function paintFarmTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  stage: string,
  progress: number,
  cropColor: string,
  cropLength: number,
) {
  ctx.fillStyle = '#3f2c21'
  ctx.fillRect(x, y, TILE, TILE)
  ctx.fillStyle = stage === 'fallow' ? '#6b4c32' : '#705335'
  ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2)
  ctx.fillStyle = stage === 'mature' ? '#b98b45' : '#4a3326'
  for (let row = 2; row < TILE - 1; row += 3) {
    ctx.fillRect(x + 1, y + row, TILE - 2, 1)
  }
  if (stage !== 'fallow') {
    ctx.fillStyle = cropColor
    const plantHeight = Math.max(1, Math.round(1 + progress * 4))
    const cropOffset = cropLength % 2
    for (let plantX = 2 + cropOffset; plantX < TILE - 1; plantX += 3) {
      ctx.fillRect(x + plantX, y + TILE - plantHeight - 1, 1, plantHeight)
      if (plantHeight >= 3) ctx.fillRect(x + plantX + 1, y + TILE - plantHeight, 1, 1)
    }
  }
  if (stage === 'mature') {
    ctx.fillStyle = 'rgba(255, 232, 145, 0.9)'
    ctx.fillRect(x, y, TILE, 1)
    ctx.fillRect(x, y + TILE - 1, TILE, 1)
    ctx.fillRect(x, y, 1, TILE)
    ctx.fillRect(x + TILE - 1, y, 1, TILE)
  }
}
