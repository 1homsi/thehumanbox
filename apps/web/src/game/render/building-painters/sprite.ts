import { PAD, PAD_BOT, PAD_TOP, mulberry32, px } from './kit'
import type { P } from './kit'
import { ARCHETYPE } from './registry'
import { isHouseLike } from '../building-draw/colors'
import { paintRoofSnow } from './snow'
import { finishSprite, shadowRows } from './finish'
import { SHADOW } from '../art-palette'
import { DRAWN, FLAT, drawBuildingArt } from '../pixel-art/buildings/index.ts'
import { drawArt } from '../pixel-art/to-canvas.ts'
import type { RoofName } from '../pixel-art/palette.ts'
import { ROOF } from '../pixel-art/palette.ts'

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
  roofTint = '',
): HTMLCanvasElement | null {
  const drawn = kind in DRAWN
  const painter = ARCHETYPE[kind]
  if (!painter && !drawn) return null
  // Snow only lies on house roofs, so the flag only splits the cache for those.
  const snowy = snow && isHouseLike(kind)
  const key = `${kind}|${fw}x${fh}|${tile}|v${variant}|n${night}|c${condBucket}|t${tier}|s${state}|w${snowy ? 1 : 0}|l${land}|r${roofTint}`
  const hit = spriteCache.get(key)
  if (hit) return hit

  const w = fw * tile
  const h = fh * tile
  const canvas = document.createElement('canvas')
  canvas.width = w + PAD * 2
  canvas.height = h + PAD_TOP + PAD_BOT
  // The finish (and the snow) read the pixels back. A canvas the browser keeps on the GPU makes each read a
  // GPU round trip: a season turning or night falling re-paints every building look on the map, and that took
  // over half a second in one frame on a grown world. Kept in memory, the reads are copies.
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.imageSmoothingEnabled = false

  if (drawn) {
    const art = drawBuildingArt({
      kind,
      fw,
      fh,
      variant,
      night,
      tier,
      state,
      land,
      roof: roofTint in ROOF ? (roofTint as RoofName) : undefined,
    })
    if (!art) return null
    // The sprite stands on the bottom edge of its footprint, centred on it.
    const ox = PAD + Math.round((w - art.w) / 2)
    const oy = canvas.height - PAD_BOT - art.h
    const flat = FLAT.has(kind) || art.h <= 6
    if (!flat) {
      ctx.fillStyle = `rgba(${SHADOW.rgb[0]},${SHADOW.rgb[1]},${SHADOW.rgb[2]},${SHADOW.alpha})`
      const groundY = canvas.height - PAD_BOT
      const right = ox + art.w - 1
      for (const row of shadowRows(ox, right, groundY, art.h, Math.min(PAD, canvas.width - 1 - right)))
        ctx.fillRect(row.x0, row.y, row.x1 - row.x0, 1)
    }
    drawArt(ctx, art, ox, oy)
    if (spriteCache.size > 900) spriteCache.clear()
    spriteCache.set(key, canvas)
    return canvas
  }
  if (!painter) return null

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
    roofTint: roofTint || undefined,
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
  finishSprite(ctx, canvas.width, canvas.height, kind, fh * tile)
  if (spriteCache.size > 900) spriteCache.clear()
  spriteCache.set(key, canvas)
  return canvas
}
