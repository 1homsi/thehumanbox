import type { Art } from './art.ts'
import { PALETTE_RGB } from './palette.ts'

/**
 * Writes a sprite into RGBA bytes (`width` pixels per row) with its top-left at (ox, oy). Pixels that fall
 * outside the buffer are dropped. Shared by the canvas path and the tests, which have no canvas.
 */
export function blitRgba(
  art: Art,
  out: Uint8ClampedArray,
  width: number,
  height: number,
  ox: number,
  oy: number,
) {
  for (let y = 0; y < art.h; y++) {
    const ty = oy + y
    if (ty < 0 || ty >= height) continue
    for (let x = 0; x < art.w; x++) {
      const c = art.px[y * art.w + x]
      const tx = ox + x
      if (!c || tx < 0 || tx >= width) continue
      const [r, g, b] = PALETTE_RGB[c]
      const o = (ty * width + tx) * 4
      out[o] = r
      out[o + 1] = g
      out[o + 2] = b
      out[o + 3] = 255
    }
  }
}

/** Draws a sprite onto a 2D canvas at whole-pixel (ox, oy), replacing what is under its drawn pixels. */
export function drawArt(ctx: CanvasRenderingContext2D, art: Art, ox: number, oy: number) {
  const img = ctx.createImageData(art.w, art.h)
  blitRgba(art, img.data, art.w, art.h, 0, 0)
  // putImageData would wipe what lies under the sprite's empty pixels, so go through a scratch canvas.
  const scratch = document.createElement('canvas')
  scratch.width = art.w
  scratch.height = art.h
  scratch.getContext('2d')!.putImageData(img, 0, 0)
  ctx.drawImage(scratch, ox, oy)
}
