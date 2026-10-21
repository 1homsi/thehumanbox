import { loadAtlas } from '../../shared/sprites'
import {
  FAUNA_ATLAS_HEIGHT,
  FAUNA_ATLAS_WIDTH,
  FAUNA_RECTS,
  faunaRect,
  paintFaunaGrid,
  type FaunaAtlasKey,
} from './fauna-layout'

const fauna = loadAtlas(`${import.meta.env.BASE_URL}sprites/fauna.png`)

let bakedFauna: HTMLCanvasElement | null | undefined
function getBakedFauna(): HTMLCanvasElement | null {
  if (bakedFauna !== undefined) return bakedFauna
  if (typeof document === 'undefined') {
    bakedFauna = null
    return null
  }
  const c = document.createElement('canvas')
  c.width = FAUNA_ATLAS_WIDTH
  c.height = FAUNA_ATLAS_HEIGHT
  const ctx = c.getContext('2d')
  if (!ctx) {
    bakedFauna = null
    return null
  }
  for (const key of Object.keys(FAUNA_RECTS) as FaunaAtlasKey[]) {
    const [sx, sy] = FAUNA_RECTS[key]
    paintFaunaGrid(ctx, key, sx, sy)
  }
  bakedFauna = c
  return bakedFauna
}

export function drawFaunaSprite(
  ctx: CanvasRenderingContext2D,
  kind: string,
  id: number,
  cx: number,
  cy: number,
  _size: number,
  flipped: boolean,
): boolean {
  const rect = faunaRect(kind, id)
  if (!rect) return false
  const src = fauna.complete && fauna.naturalWidth > 0 ? fauna : getBakedFauna()
  const [sx, sy, sw, sh] = rect
  const width = sw
  const height = sh
  const s = Math.max(sw, sh)
  const top = kind === 'fish' ? cy - height / 2 : cy + s * 0.42 - height
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.translate(Math.round(cx), Math.round(top))
  if (flipped) ctx.scale(-1, 1)
  if (src) {
    ctx.drawImage(src, sx, sy, sw, sh, -Math.round(width / 2), 0, width, height)
  } else {
    const key: FaunaAtlasKey =
      kind === 'bird' ? (id % 2 === 0 ? 'bird' : 'goldBird') : (kind as FaunaAtlasKey)
    paintFaunaGrid(ctx, key, -Math.round(width / 2), 0)
  }
  ctx.restore()
  return true
}
