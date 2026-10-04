export function vnHash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0
  return ((h >>> 0) & 0xffff) / 0xffff
}

export function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = vnHash(xi, yi)
  const b = vnHash(xi + 1, yi)
  const c = vnHash(xi, yi + 1)
  const d = vnHash(xi + 1, yi + 1)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

/**
 * `valueNoise` for a sweep over neighbouring tiles. Each call blends the four hashed corners
 * of the lattice cell it falls in; consecutive tiles share a cell for dozens of steps, so the
 * corners are kept until the cell changes. Returns exactly what `valueNoise` returns.
 */
class CellNoise {
  private xi = Number.NaN
  private yi = Number.NaN
  private a = 0
  private b = 0
  private c = 0
  private d = 0
  at(x: number, y: number): number {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const fx = x - xi
    const fy = y - yi
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    if (xi !== this.xi || yi !== this.yi) {
      this.xi = xi
      this.yi = yi
      this.a = vnHash(xi, yi)
      this.b = vnHash(xi + 1, yi)
      this.c = vnHash(xi, yi + 1)
      this.d = vnHash(xi + 1, yi + 1)
    }
    const a = this.a
    const b = this.b
    const c = this.c
    const d = this.d
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
  }
}
export const macroNoise = new CellNoise()
export const macroNoiseFine = new CellNoise()
