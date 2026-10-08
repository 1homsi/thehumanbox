import {
  HUMAN_APPEARANCES,
  HUMAN_ATLAS_CELL,
  HUMAN_ATLAS_HEIGHT,
  HUMAN_ATLAS_WIDTH,
  HUMAN_LOOK_TINTS,
  HUMAN_SEX_ORDER,
  HUMAN_SHEET_APPEARANCES,
  HUMAN_STAGE_ORDER,
} from '../../character-visuals'

/**
 * The people sheet has six figures per sex and life stage. This turns it into one look per figure
 * and tint (24 looks): clothes take a new hue, skin is lighter or darker, and everything else
 * (outlines, hair, greys, the shadowed belts) stays as drawn. The atlas is built once, when the
 * sheet loads, so the GPU and the canvas fallback read the same pixels.
 */

/** RGB 0..255 to HSL (hue in degrees, saturation and lightness 0..1). */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rf = r / 255
  const gf = g / 255
  const bf = b / 255
  const max = Math.max(rf, gf, bf)
  const min = Math.min(rf, gf, bf)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rf) h = (gf - bf) / d + (gf < bf ? 6 : 0)
  else if (max === gf) h = (bf - rf) / d + 2
  else h = (rf - gf) / d + 4
  return [h * 60, s, l]
}

/** HSL (hue in degrees, saturation and lightness 0..1) to RGB 0..255. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t: number) => {
    let x = t
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  const hh = (((h % 360) + 360) % 360) / 360
  return [Math.round(hue(hh + 1 / 3) * 255), Math.round(hue(hh) * 255), Math.round(hue(hh - 1 / 3) * 255)]
}

/** Skin in the sheet is orange-brown: warm hue, moderate saturation. Clothes keep their colour. */
function isSkin(h: number, s: number, l: number): boolean {
  return h >= 8 && h <= 40 && s >= 0.2 && s <= 0.75 && l >= 0.3
}

/**
 * One pixel recoloured for a tint. Clothing (saturated, not skin-hued) turns by `hue`; skin (warm,
 * moderately saturated) gets its lightness scaled by `skin`. Greys, outlines and hair stay put.
 */
export function tintPixel(
  r: number,
  g: number,
  b: number,
  tint: { hue: number; skin: number },
): [number, number, number] {
  const [h, s, l] = rgbToHsl(r, g, b)
  if (isSkin(h, s, l)) {
    const lightness = Math.max(0, Math.min(1, l * tint.skin))
    return hslToRgb(h, s, lightness)
  }
  // Outlines and hair are very dark: they keep their colour however saturated they read.
  if (s < 0.22 || l < 0.22 || tint.hue === 0) return [r, g, b]
  return hslToRgb(h + tint.hue, s, l)
}

/**
 * Builds the look atlas from the sheet's pixels. `src` is the sheet (RGBA, `srcWidth` wide, six
 * figures per sex and life stage); `dst` must be `HUMAN_ATLAS_WIDTH` x `HUMAN_ATLAS_HEIGHT` RGBA
 * and is fully written. Row layout follows `humanAtlasRow`: look `tint * 6 + figure`.
 */
export function expandPeopleSheet(src: Uint8ClampedArray, srcWidth: number, dst: Uint8ClampedArray): void {
  const cell = HUMAN_ATLAS_CELL
  const rowsPerStage = HUMAN_APPEARANCES
  const stages = HUMAN_STAGE_ORDER.length
  const sexes = HUMAN_SEX_ORDER.length
  const dstWidth = srcWidth
  const rowBytes = cell * dstWidth * 4
  for (let sex = 0; sex < sexes; sex++) {
    for (let stage = 0; stage < stages; stage++) {
      for (let look = 0; look < rowsPerStage; look++) {
        const figure = look % HUMAN_SHEET_APPEARANCES
        const tint = HUMAN_LOOK_TINTS[Math.floor(look / HUMAN_SHEET_APPEARANCES)]
        const srcRow = (sex * stages + stage) * HUMAN_SHEET_APPEARANCES + figure
        const dstRow = (sex * stages + stage) * rowsPerStage + look
        const srcBase = srcRow * rowBytes
        const dstBase = dstRow * rowBytes
        for (let y = 0; y < cell; y++) {
          const so = srcBase + y * dstWidth * 4
          const dO = dstBase + y * dstWidth * 4
          for (let x = 0; x < dstWidth; x++) {
            const i = so + x * 4
            const o = dO + x * 4
            const a = src[i + 3]
            if (a === 0 || tint.hue === 0) {
              dst[o] = src[i]
              dst[o + 1] = src[i + 1]
              dst[o + 2] = src[i + 2]
              dst[o + 3] = a
              continue
            }
            const [r, g, b] = tintPixel(src[i], src[i + 1], src[i + 2], tint)
            dst[o] = r
            dst[o + 1] = g
            dst[o + 2] = b
            dst[o + 3] = a
          }
        }
      }
    }
  }
}

/** The look atlas as a canvas, built from the rasterised sheet. Browser only. */
export function buildPeopleLookAtlas(sheet: HTMLCanvasElement): HTMLCanvasElement {
  const srcCtx = sheet.getContext('2d')
  const out = document.createElement('canvas')
  out.width = HUMAN_ATLAS_WIDTH
  out.height = HUMAN_ATLAS_HEIGHT
  const outCtx = out.getContext('2d')
  if (!srcCtx || !outCtx) return out
  const src = srcCtx.getImageData(0, 0, sheet.width, sheet.height)
  const dst = outCtx.createImageData(HUMAN_ATLAS_WIDTH, HUMAN_ATLAS_HEIGHT)
  expandPeopleSheet(src.data, sheet.width, dst.data)
  outCtx.putImageData(dst, 0, 0)
  return out
}
