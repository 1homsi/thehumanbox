import { PAD, PAD_BOT, PAD_TOP } from './kit'
import { shadowRows } from './shadow'
import { isHouseLike } from '../building-draw/colors'
import { SHADOW } from '../art-palette'
import type { Art } from '../pixel-art/art.ts'
import { DRAWN, FLAT, drawBuildingArt } from '../pixel-art/buildings/index.ts'
import { snowOn, wornOn } from '../pixel-art/buildings/wear.ts'
import { drawArt } from '../pixel-art/to-canvas.ts'
import { ROOF } from '../pixel-art/palette.ts'
import type { RoofName } from '../pixel-art/palette.ts'

const spriteCache = new Map<string, HTMLCanvasElement>()

/** A kind the map has no drawing for (an old save, a kind added to the sim first) is drawn as a plain house. */
const UNKNOWN_KIND = 'House'

/**
 * The drawing of a building, as it is baked: its kind's sprite, with snow on its roof in winter and cracks
 * when it is in poor repair. No canvas involved, so the tests can look at exactly what the map shows.
 */
export function buildingArt(
  kind: string,
  fw: number,
  fh: number,
  variant: number,
  night: number,
  condBucket: number,
  tier = 0,
  state = '',
  snow = false,
  land = '',
  roofTint = '',
): Art | null {
  const drawn = kind in DRAWN ? kind : UNKNOWN_KIND
  let art = drawBuildingArt({
    kind: drawn,
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
  // Snow only lies on house roofs.
  if (snow && isHouseLike(kind)) art = snowOn(art)
  if (condBucket === 0) art = wornOn(art, variant)
  return art
}

/**
 * A building's sprite in the padded cell the map bakes: the drawing standing on the bottom edge of its
 * footprint and centred on it, over its flat cast shadow. Cached by everything that changes the look.
 */
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
  const snowy = snow && isHouseLike(kind)
  const key = `${kind}|${fw}x${fh}|${tile}|v${variant}|n${night}|c${condBucket}|t${tier}|s${state}|w${snowy ? 1 : 0}|l${land}|r${roofTint}`
  const hit = spriteCache.get(key)
  if (hit) return hit

  const art = buildingArt(kind, fw, fh, variant, night, condBucket, tier, state, snowy, land, roofTint)
  if (!art) return null
  const w = fw * tile
  const canvas = document.createElement('canvas')
  canvas.width = w + PAD * 2
  canvas.height = fh * tile + PAD_TOP + PAD_BOT
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = false

  const ox = PAD + Math.round((w - art.w) / 2)
  const groundY = canvas.height - PAD_BOT
  const oy = groundY - art.h
  if (!FLAT.has(kind) && art.h > 6) {
    ctx.fillStyle = `rgba(${SHADOW.rgb[0]},${SHADOW.rgb[1]},${SHADOW.rgb[2]},${SHADOW.alpha})`
    const right = ox + art.w - 1
    for (const row of shadowRows(ox, right, groundY, art.h, Math.min(PAD, canvas.width - 1 - right)))
      ctx.fillRect(row.x0, row.y, row.x1 - row.x0, 1)
  }
  drawArt(ctx, art, ox, oy)
  if (spriteCache.size > 900) spriteCache.clear()
  spriteCache.set(key, canvas)
  return canvas
}
