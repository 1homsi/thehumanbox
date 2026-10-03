import { loadAtlas } from '../../utils/sprites'
import { faunaRect } from './fauna-layout'

const fauna = loadAtlas(`${import.meta.env.BASE_URL}sprites/fauna-v2.png`)

export function drawFaunaSprite(
  ctx: CanvasRenderingContext2D,
  kind: string,
  id: number,
  cx: number,
  cy: number,
  size: number,
  flipped: boolean,
): boolean {
  const rect = faunaRect(kind, id)
  if (!rect || !fauna.complete || fauna.naturalWidth === 0) return false
  const [sx, sy, sw, sh] = rect
  const scale = size / Math.max(sw, sh)
  const width = Math.max(1, Math.round(sw * scale))
  const height = Math.max(1, Math.round(sh * scale))
  const top = kind === 'fish' ? cy - height / 2 : cy + size * 0.42 - height
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.translate(Math.round(cx), Math.round(top))
  if (flipped) ctx.scale(-1, 1)
  ctx.drawImage(fauna, sx, sy, sw, sh, -Math.round(width / 2), 0, width, height)
  ctx.restore()
  return true
}
