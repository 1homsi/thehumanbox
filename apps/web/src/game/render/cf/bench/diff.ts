export interface DiffStats {
  pixels: number
  /** Mean absolute difference over R, G and B, 0..255. */
  meanAbs: number
  /** Share of pixels whose largest channel difference exceeds 8 / 24 / 64 (0..1). */
  over8: number
  over24: number
  over64: number
  /** Pixels that differ from `ground` in either image (the part of the picture the layers drew). */
  covered: number
  /** The same measures over only those pixels. */
  coveredMeanAbs: number
  coveredOver24: number
}

/**
 * Compare two RGBA buffers of the same size. `ground` is the flat colour both were drawn over, so
 * the "covered" measures ignore the (identical) empty areas that would otherwise dilute the numbers.
 */
export function diffStats(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  ground: readonly [number, number, number],
): DiffStats {
  const n = Math.min(a.length, b.length) >> 2
  let sum = 0
  let o8 = 0
  let o24 = 0
  let o64 = 0
  let covered = 0
  let cSum = 0
  let cO24 = 0
  for (let i = 0; i < n; i++) {
    const k = i * 4
    const dr = Math.abs(a[k] - b[k])
    const dg = Math.abs(a[k + 1] - b[k + 1])
    const db = Math.abs(a[k + 2] - b[k + 2])
    const m = Math.max(dr, dg, db)
    const mean = (dr + dg + db) / 3
    sum += mean
    if (m > 8) o8++
    if (m > 24) o24++
    if (m > 64) o64++
    const aGround = a[k] === ground[0] && a[k + 1] === ground[1] && a[k + 2] === ground[2]
    const bGround = b[k] === ground[0] && b[k + 1] === ground[1] && b[k + 2] === ground[2]
    if (!aGround || !bGround) {
      covered++
      cSum += mean
      if (m > 24) cO24++
    }
  }
  return {
    pixels: n,
    meanAbs: n ? sum / n : 0,
    over8: n ? o8 / n : 0,
    over24: n ? o24 / n : 0,
    over64: n ? o64 / n : 0,
    covered,
    coveredMeanAbs: covered ? cSum / covered : 0,
    coveredOver24: covered ? cO24 / covered : 0,
  }
}

/** A difference image: grey where equal, red where `a` is brighter, blue where `b` is, amplified. */
export function diffImage(a: ArrayLike<number>, b: ArrayLike<number>, out: Uint8ClampedArray): void {
  const n = Math.min(a.length, b.length, out.length) >> 2
  for (let i = 0; i < n; i++) {
    const k = i * 4
    const d = (a[k] + a[k + 1] + a[k + 2] - b[k] - b[k + 1] - b[k + 2]) / 3
    const amp = Math.min(255, Math.abs(d) * 4)
    out[k] = 40 + (d > 0 ? amp : 0)
    out[k + 1] = 40
    out[k + 2] = 40 + (d < 0 ? amp : 0)
    out[k + 3] = 255
  }
}
