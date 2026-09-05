import { loadAtlas } from '../../utils/sprites'

const atlas = loadAtlas(`${import.meta.env.BASE_URL}sprites/vegetation-v2.png`)
const crops: Record<string, readonly [number, number, number, number]> = {
  '4,0': [38, 26, 378, 393],
  '3,0': [38, 26, 378, 393],
  '5,0': [519, 14, 295, 410],
  '6,0': [519, 14, 295, 410],
  '2,0': [936, 21, 326, 403],
  '7,0': [1366, 26, 368, 399],
  '8,0': [35, 467, 373, 389],
  '11,0': [501, 478, 330, 378],
  '10,0': [984, 473, 249, 379],
  '4,1': [1389, 589, 333, 261],
}

export function drawVegetationSprite(
  ctx: CanvasRenderingContext2D,
  tile: readonly [number, number],
  x: number,
  y: number,
  size: number,
): boolean {
  const crop = crops[tile.join(',')]
  if (!crop || !atlas.complete || atlas.naturalWidth === 0) return false
  const [sx, sy, sw, sh] = crop
  const scale = size / Math.max(sw, sh)
  const width = Math.max(1, Math.round(sw * scale))
  const height = Math.max(1, Math.round(sh * scale))
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(
    atlas,
    sx,
    sy,
    sw,
    sh,
    Math.round(x + (size - width) / 2),
    Math.round(y + size * 0.88 - height),
    width,
    height,
  )
  ctx.restore()
  return true
}
