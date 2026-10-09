import { PAD, PAD_BOT, PAD_TOP, mulberry32, px } from './kit'
import type { P } from './kit'
import { ARCHETYPE } from './registry'
import { isHouseLike } from '../building-draw/colors'
import { paintRoofSnow } from './snow'

const spriteCache = new Map<string, HTMLCanvasElement>()

export function getBuildingSprite(
  kind: string,
  fw: number,
  fh: number,
  tile: number,
  variant: number,
  night: number,
  condBucket: number,
  tier = 0,
  state = '',
  snow = false,
  land = '',
): HTMLCanvasElement | null {
  const painter = ARCHETYPE[kind]
  if (!painter) return null
  // Snow only lies on house roofs, so the flag only splits the cache for those.
  const snowy = snow && isHouseLike(kind)
  const key = `${kind}|${fw}x${fh}|${tile}|v${variant}|n${night}|c${condBucket}|t${tier}|s${state}|w${snowy ? 1 : 0}|l${land}`
  const hit = spriteCache.get(key)
  if (hit) return hit

  const w = fw * tile
  const h = fh * tile
  const canvas = document.createElement('canvas')
  canvas.width = w + PAD * 2
  canvas.height = h + PAD_TOP + PAD_BOT
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = false

  const p: P = {
    ctx,
    x0: PAD,
    y1: canvas.height - PAD_BOT,
    w,
    h: h + PAD_TOP * 0.45,
    rng: mulberry32(variant * 1013904223 + kind.length * 7919 + fw * 131),
    night,
    cond: condBucket === 0 ? 0.3 : 1,
    kind,
    variant,
    tier,
    state,
    land,
  }
  const ok = painter(p)
  if (ok === false) return null
  if (snowy) paintRoofSnow(ctx, canvas.width, canvas.height, variant * 31 + fw * 7 + fh)
  if (condBucket === 0) {
    // Tint only opaque sprite pixels, preserving the actual roof silhouette.
    ctx.save()
    ctx.globalCompositeOperation = 'source-atop'
    ctx.fillStyle = 'rgba(63, 49, 32, 0.25)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    for (let i = 0; i < 5; i++) {
      const x = PAD + p.rng() * w
      const y = p.y1 - p.h * (0.45 + p.rng() * 0.4)
      px(ctx, x, y, 3, 2, '#4a3d30')
    }
    ctx.restore()
  }
  if (spriteCache.size > 900) spriteCache.clear()
  spriteCache.set(key, canvas)
  return canvas
}
