// CSS colour strings (the canvas painters' language) to the packed 0xRRGGBBAA
// that xipjs's SpriteLayer and TileLayer tint arrays take.

export interface Rgba {
  r: number
  g: number
  b: number
  /** 0..1 */
  a: number
}

const cache = new Map<string, Rgba>()
const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 }

function clamp255(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : Math.round(n)
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = (((h % 360) + 360) % 360) / 360
  if (s === 0) return [clamp255(l * 255), clamp255(l * 255), clamp255(l * 255)]
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
  return [clamp255(hue(hh + 1 / 3) * 255), clamp255(hue(hh) * 255), clamp255(hue(hh - 1 / 3) * 255)]
}

function parseUncached(css: string): Rgba {
  const s = css.trim().toLowerCase()
  if (s.startsWith('#')) {
    const hex = s.slice(1)
    if (hex.length === 3 || hex.length === 4) {
      const d = [...hex].map((c) => parseInt(c + c, 16))
      return { r: d[0], g: d[1], b: d[2], a: d.length === 4 ? d[3] / 255 : 1 }
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      }
    }
    return WHITE
  }
  const m = /^(rgba?|hsla?)\(([^)]+)\)$/.exec(s)
  if (m) {
    const parts = m[2].split(/[\s,/]+/).filter(Boolean)
    const num = (v: string | undefined, fallback: number) => {
      if (v === undefined) return fallback
      return v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v)
    }
    const alpha = parts.length > 3 ? Math.max(0, Math.min(1, num(parts[3], 1))) : 1
    if (m[1].startsWith('rgb')) {
      const ch = (v: string) => (v.endsWith('%') ? (parseFloat(v) / 100) * 255 : parseFloat(v))
      return { r: clamp255(ch(parts[0])), g: clamp255(ch(parts[1])), b: clamp255(ch(parts[2])), a: alpha }
    }
    const [r, g, b] = hslToRgb(parseFloat(parts[0]), num(parts[1], 0), num(parts[2], 0))
    return { r, g, b, a: alpha }
  }
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  if (s === 'white') return WHITE
  if (s === 'black') return { r: 0, g: 0, b: 0, a: 1 }
  return WHITE
}

/** Parse a CSS colour; results are cached (painters pass the same few hundred strings every frame). */
export function parseColor(css: string): Rgba {
  let c = cache.get(css)
  if (c === undefined) {
    if (cache.size >= 8192) cache.clear()
    c = parseUncached(css)
    cache.set(css, c)
  }
  return c
}

/** Pack to 0xRRGGBBAA. `alpha` multiplies the colour's own alpha (canvas `globalAlpha`). */
export function packRgba(r: number, g: number, b: number, a: number): number {
  const a8 = a <= 0 ? 0 : a >= 1 ? 255 : Math.round(a * 255)
  return (((clamp255(r) << 24) | (clamp255(g) << 16) | (clamp255(b) << 8) | a8) >>> 0) as number
}

export function packColor(css: string, alpha = 1): number {
  const c = parseColor(css)
  return packRgba(c.r, c.g, c.b, c.a * alpha)
}
