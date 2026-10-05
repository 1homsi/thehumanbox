/** Colours for SpriteLayer: a 0xRRGGBBAA word, built from the CSS strings the canvas painter uses. */

export function rgba32(r: number, g: number, b: number, a = 255): number {
  const c = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))
  return ((c(r) << 24) | (c(g) << 16) | (c(b) << 8) | c(a)) >>> 0
}

/** The same colour with its alpha multiplied by `k` (0..1). */
export function withAlpha(color: number, k: number): number {
  const a = Math.round((color & 255) * (k < 0 ? 0 : k > 1 ? 1 : k))
  return ((color & 0xffffff00) | a) >>> 0
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = (((h % 360) + 360) % 360) / 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hh * 6) % 2) - 1))
  const m = l - c / 2
  const sector = Math.floor(hh * 6)
  const [r, g, b] =
    sector === 0
      ? [c, x, 0]
      : sector === 1
        ? [x, c, 0]
        : sector === 2
          ? [0, c, x]
          : sector === 3
            ? [0, x, c]
            : sector === 4
              ? [x, 0, c]
              : [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

const cache = new Map<string, number>()

/**
 * Parses `#rgb`, `#rrggbb`, `rgb()`, `rgba()`, `hsl()` and `hsla()`. Unknown
 * text is opaque grey so a bad colour is visible rather than invisible.
 */
export function cssToRgba32(css: string): number {
  const hit = cache.get(css)
  if (hit !== undefined) return hit
  const out = parseCss(css)
  if (cache.size > 4096) cache.clear()
  cache.set(css, out)
  return out
}

function parseCss(css: string): number {
  const s = css.trim().toLowerCase()
  if (s.startsWith('#')) {
    const hex = s.slice(1)
    if (hex.length === 3 || hex.length === 4) {
      const v = [...hex].map((ch) => parseInt(ch + ch, 16))
      return rgba32(v[0], v[1], v[2], v[3] ?? 255)
    }
    if (hex.length === 6 || hex.length === 8) {
      const n = parseInt(hex.slice(0, 6), 16)
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255
      return rgba32((n >> 16) & 255, (n >> 8) & 255, n & 255, a)
    }
  }
  const m = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(s)
  if (m) {
    const parts = m[2].split(/[\s,/]+/).filter(Boolean)
    const num = (p: string | undefined, fallback: number) => {
      if (p === undefined) return fallback
      const v = parseFloat(p)
      if (!Number.isFinite(v)) return fallback
      return p.endsWith('%') ? v / 100 : v
    }
    const alpha = Math.round(num(parts[3], 1) * 255)
    if (m[1].startsWith('rgb')) {
      const pct = (p: string) => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p))
      return rgba32(pct(parts[0]), pct(parts[1]), pct(parts[2]), alpha)
    }
    const [r, g, b] = hslToRgb(parseFloat(parts[0]), num(parts[1], 0), num(parts[2], 0))
    return rgba32(r, g, b, alpha)
  }
  return rgba32(128, 128, 128)
}
