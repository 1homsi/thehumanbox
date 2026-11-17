// A plain RGBA canvas for the art sheets: sprites enlarged by whole factors, and labels in a 3x5 pixel font.
import { writePng } from './png.mjs'

const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101011001', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101011', V: '101101101010010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '010101101101010', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100110101010', 7: '111001010010010', 8: '010101010101010',
  9: '010101011001110', '-': '000000111000000', '.': '000000000000010', '/': '001001010100100', ':': '000010000010000',
  '+': '000010111010000', x: '000101010101000',
}

export class Sheet {
  constructor(w, h, ground) {
    this.w = w
    this.h = h
    this.data = new Uint8Array(w * h * 4)
    this.fill(0, 0, w, h, ground)
  }

  fill(x, y, w, h, [r, g, b]) {
    for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++)
      for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) {
        const o = (j * this.w + i) * 4
        this.data[o] = r
        this.data[o + 1] = g
        this.data[o + 2] = b
        this.data[o + 3] = 255
      }
  }

  /** A palette-indexed sprite ({w, h, px}) at (x, y), each pixel `scale` wide. */
  sprite(art, palette, x, y, scale) {
    for (let j = 0; j < art.h; j++)
      for (let i = 0; i < art.w; i++) {
        const c = art.px[j * art.w + i]
        if (c) this.fill(x + i * scale, y + j * scale, scale, scale, palette[c])
      }
  }

  text(str, x, y, colour = [255, 255, 255], size = 2) {
    let cx = x
    for (const ch of String(str).toUpperCase()) {
      const g = GLYPHS[ch] ?? GLYPHS[ch.toLowerCase()]
      if (g) for (let k = 0; k < 15; k++) if (g[k] === '1') this.fill(cx + (k % 3) * size, y + Math.floor(k / 3) * size, size, size, colour)
      cx += 4 * size
    }
  }

  save(path) {
    writePng(path, this.w, this.h, this.data)
  }
}

/**
 * Lays labelled sprites out in rows on a ground colour and saves the sheet. `items` are { label, art };
 * a null art leaves a labelled gap. Bottoms line up along each row.
 */
export function saveSheet(path, title, items, palette, { scale = 4, cols = 10, ground = [117, 167, 67] } = {}) {
  const cellW = Math.max(40, ...items.map((i) => (i.art ? i.art.w : 0) * scale + 12), ...items.map((i) => i.label.length * 8 + 8))
  const rowsOf = []
  for (let i = 0; i < items.length; i += cols) rowsOf.push(items.slice(i, i + cols))
  const rowH = rowsOf.map((r) => Math.max(8, ...r.map((i) => (i.art ? i.art.h : 0))) * scale + 26)
  const W = cellW * Math.min(cols, items.length) + 12
  const H = rowH.reduce((s, h) => s + h, 0) + 30
  const sheet = new Sheet(W, H, ground)
  sheet.text(title, 8, 8, [255, 255, 255], 3)
  let y = 30
  rowsOf.forEach((row, r) => {
    row.forEach((item, c) => {
      const x = 6 + c * cellW
      if (item.art) sheet.sprite(item.art, palette, x + Math.floor((cellW - item.art.w * scale) / 2), y + rowH[r] - 20 - item.art.h * scale, scale)
      sheet.text(item.label, x + 4, y + rowH[r] - 14, [20, 30, 20], 2)
    })
    y += rowH[r]
  })
  sheet.save(path)
}
