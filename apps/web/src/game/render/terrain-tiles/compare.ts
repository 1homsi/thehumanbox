/** Image comparison helpers for the terrain backends: per-pixel and per-block difference statistics. */

export interface DiffStats {
  pixels: number
  /** Mean absolute difference over the R, G and B channels (0..255). */
  meanAbs: number
  /** Root mean square difference over the channels. */
  rms: number
  /** Mean signed difference (b - a) per channel: a colour cast shows up here. */
  bias: [number, number, number]
  /** Largest single-channel difference. */
  maxAbs: number
  /** Share of pixels whose largest channel difference exceeds 2, 4, 8 and 16. */
  over2: number
  over4: number
  over8: number
  over16: number
}

/**
 * Difference between two RGBA images of the same size, `b - a`. `include` (one byte per pixel,
 * nonzero = counted) restricts the comparison, e.g. to pixels no tree or building covers.
 */
export function diffStats(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  include?: ArrayLike<number>,
): DiffStats {
  const n = a.length >> 2
  let count = 0
  let abs = 0
  let sq = 0
  let maxAbs = 0
  const bias: [number, number, number] = [0, 0, 0]
  let o2 = 0
  let o4 = 0
  let o8 = 0
  let o16 = 0
  for (let i = 0; i < n; i++) {
    if (include && !include[i]) continue
    count++
    let worst = 0
    for (let c = 0; c < 3; c++) {
      const d = b[i * 4 + c] - a[i * 4 + c]
      bias[c] += d
      const m = d < 0 ? -d : d
      abs += m
      sq += d * d
      if (m > worst) worst = m
    }
    if (worst > maxAbs) maxAbs = worst
    if (worst > 2) o2++
    if (worst > 4) o4++
    if (worst > 8) o8++
    if (worst > 16) o16++
  }
  const k = Math.max(1, count)
  return {
    pixels: count,
    meanAbs: abs / (k * 3),
    rms: Math.sqrt(sq / (k * 3)),
    bias: [bias[0] / k, bias[1] / k, bias[2] / k],
    maxAbs,
    over2: o2 / k,
    over4: o4 / k,
    over8: o8 / k,
    over16: o16 / k,
  }
}

/**
 * Mean RGB of every `block` x `block` pixel square (the image's width and height must be
 * multiples of `block`). Comparing block means separates colour pipeline error (tile colour,
 * season, depth) from texture error (the per-pixel noise, which cannot match).
 */
export function blockMeans(
  img: ArrayLike<number>,
  width: number,
  height: number,
  block: number,
): Float32Array {
  const bw = Math.floor(width / block)
  const bh = Math.floor(height / block)
  const out = new Float32Array(bw * bh * 4)
  const area = block * block
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let r = 0
      let g = 0
      let b = 0
      for (let y = 0; y < block; y++) {
        let i = ((by * block + y) * width + bx * block) * 4
        for (let x = 0; x < block; x++, i += 4) {
          r += img[i]
          g += img[i + 1]
          b += img[i + 2]
        }
      }
      const o = (by * bw + bx) * 4
      out[o] = r / area
      out[o + 1] = g / area
      out[o + 2] = b / area
      out[o + 3] = 255
    }
  }
  return out
}

/** Standard deviation of the luma inside every block, averaged: how much texture the image has. */
export function meanBlockContrast(
  img: ArrayLike<number>,
  width: number,
  height: number,
  block: number,
): number {
  const bw = Math.floor(width / block)
  const bh = Math.floor(height / block)
  const area = block * block
  let total = 0
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let sum = 0
      let sq = 0
      for (let y = 0; y < block; y++) {
        let i = ((by * block + y) * width + bx * block) * 4
        for (let x = 0; x < block; x++, i += 4) {
          const l = (img[i] * 3 + img[i + 1] * 6 + img[i + 2]) / 10
          sum += l
          sq += l * l
        }
      }
      const mean = sum / area
      total += Math.sqrt(Math.max(0, sq / area - mean * mean))
    }
  }
  return total / Math.max(1, bw * bh)
}
