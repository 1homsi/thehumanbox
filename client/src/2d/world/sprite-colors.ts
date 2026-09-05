function rgbHex(channels: number[]): string {
  return (
    '#' +
    channels
      .map((c) =>
        Math.max(0, Math.min(255, Math.round(c)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  )
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function shade(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex)
  if (f >= 1) {
    const k = f - 1
    return rgbHex([r, g, b].map((c) => c + (255 - c) * k))
  }
  return rgbHex([r * f, g * f, b * f])
}

export function hueShift(hex: string, deg: number, satF = 1, lumF = 1): string {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255)
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  const d = mx - mn
  let h = 0
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (d !== 0) {
    if (mx === r) h = ((g - b) / d) % 6
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  h = (h + deg + 360) % 360
  const s2 = Math.max(0, Math.min(1, s * satF))
  const l2 = Math.max(0, Math.min(1, l * lumF))
  // Return hex so subsequent material shading receives RGB, not an HSL
  // string accidentally parsed as hexadecimal (which used to turn it black).
  const chroma = (1 - Math.abs(2 * l2 - 1)) * s2
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l2 - chroma / 2
  const channels =
    h < 60
      ? [chroma, x, 0]
      : h < 120
        ? [x, chroma, 0]
        : h < 180
          ? [0, chroma, x]
          : h < 240
            ? [0, x, chroma]
            : h < 300
              ? [x, 0, chroma]
              : [chroma, 0, x]
  return rgbHex(channels.map((c) => (c + m) * 255))
}
