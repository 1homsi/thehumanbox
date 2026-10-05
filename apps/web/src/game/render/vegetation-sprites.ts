import { loadAtlas } from '../../shared/sprites'

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

// Sprite tiles are shared constant tuples, so their crop is looked up once per tuple
// instead of joining a key string for every tree on every frame.
const cropByTile = new WeakMap<readonly [number, number], readonly [number, number, number, number] | null>()
function cropFor(tile: readonly [number, number]) {
  let crop = cropByTile.get(tile)
  if (crop === undefined) {
    crop = crops[tile.join(',')] ?? null
    cropByTile.set(tile, crop)
  }
  return crop
}

/** Where and how large a vegetation sprite lands for a tree box of `size` at (x, y). */
export interface VegetationPlacement {
  /** Source rectangle in the vegetation atlas. */
  sx: number
  sy: number
  sw: number
  sh: number
  /** Destination, in whole pixels. */
  dx: number
  dy: number
  width: number
  height: number
}

export function vegetationPlacement(
  tile: readonly [number, number],
  x: number,
  y: number,
  size: number,
): VegetationPlacement | null {
  const crop = cropFor(tile)
  if (!crop) return null
  const [sx, sy, sw, sh] = crop
  const scale = size / Math.max(sw, sh)
  const width = Math.max(1, Math.round(sw * scale))
  const height = Math.max(1, Math.round(sh * scale))
  return {
    sx,
    sy,
    sw,
    sh,
    dx: Math.round(x + (size - width) / 2),
    dy: Math.round(y + size * 0.88 - height),
    width,
    height,
  }
}

export function vegetationAtlasReady(): boolean {
  return atlas.complete && atlas.naturalWidth > 0
}

/** Draw a vegetation sprite's pixels into a canvas at its source crop's scaled size. */
export function drawVegetationCrop(ctx: CanvasRenderingContext2D, p: VegetationPlacement, x = 0, y = 0) {
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(atlas, p.sx, p.sy, p.sw, p.sh, x, y, p.width, p.height)
  ctx.restore()
}

export function drawVegetationSprite(
  ctx: CanvasRenderingContext2D,
  tile: readonly [number, number],
  x: number,
  y: number,
  size: number,
): boolean {
  if (!vegetationAtlasReady()) return false
  const p = vegetationPlacement(tile, x, y, size)
  if (!p) return false
  drawVegetationCrop(ctx, p, p.dx, p.dy)
  return true
}
