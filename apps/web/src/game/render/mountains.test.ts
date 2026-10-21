import { describe, expect, it } from 'vitest'
import { TILE } from '../model/palette'
import { TILE_ID } from '../model/terrain-ids'
import { SHADOW, SNOW } from './art-palette'
import { MASS_CELL, MASS_SHADOW, drawMassTile, massTileKey, mountainHeights } from './mountains'

/** A square range of rock `size` tiles across, centred in a map of `map` tiles. */
function range(size: number, map: number) {
  const start = Math.floor((map - size) / 2)
  const tiles = Array.from({ length: map }, (_, y) =>
    Array.from({ length: map }, (_, x) =>
      x >= start && x < start + size && y >= start && y < start + size ? TILE_ID.ROCK : TILE_ID.GRASS,
    ),
  )
  return { tiles, h: mountainHeights(tiles, map, map), start }
}

/** Paints one tile's cell and returns its pixels as CSS colours ('' where nothing was drawn). */
function paint(h: Uint8Array, map: number, x: number, y: number): string[][] {
  const px = Array.from({ length: MASS_CELL }, () => Array<string>(MASS_CELL).fill(''))
  const ctx = {
    fillStyle: '',
    fillRect(x0: number, y0: number, w: number, hh: number) {
      for (let yy = y0; yy < y0 + hh; yy++) for (let xx = x0; xx < x0 + w; xx++) px[yy][xx] = this.fillStyle
    },
  }
  drawMassTile(ctx as unknown as CanvasRenderingContext2D, h, map, map, x, y, false, 0, 0)
  return px
}

const brightness = (css: string) => {
  const [r, g, b] = css.match(/\d+/g)!.map(Number)
  return r + g + b
}

/** Mean brightness of the tile's own 8x8 pixels. */
function tileBrightness(px: string[][]): number {
  let sum = 0
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) sum += brightness(px[y][x])
  return sum / (TILE * TILE)
}

describe('mountain relief', () => {
  it('lights the faces turned to the north-west and shades those turned to the south-east', () => {
    const map = 24
    const { h, start } = range(12, map)
    const nw = tileBrightness(paint(h, map, start + 2, start + 2))
    const se = tileBrightness(paint(h, map, start + 9, start + 9))
    expect(nw).toBeGreaterThan(se + 60)
  })

  it('puts snow on the high core of a wide range only', () => {
    // Every snow tone is brighter than the brightest rock (the ridge line included).
    const snowy = (px: string[][]) => px.flat().some((c) => c.startsWith('rgb(') && brightness(c) > 600)
    expect(SNOW.lit[0] + SNOW.lit[1] + SNOW.lit[2]).toBeGreaterThan(600)
    const narrow = range(6, 16)
    for (let y = narrow.start; y < narrow.start + 6; y++)
      for (let x = narrow.start; x < narrow.start + 6; x++)
        expect(snowy(paint(narrow.h, 16, x, y))).toBe(false)
    const wide = range(30, 40)
    const mid = wide.start + 15
    expect(snowy(paint(wide.h, 40, mid, mid))).toBe(true)
    expect(snowy(paint(wide.h, 40, wide.start + 1, mid))).toBe(false)
  })

  it('casts a flat shadow onto the lowland to the south-east and nowhere else', () => {
    const map = 16
    const { h, start } = range(4, map)
    const corner = paint(h, map, start + 3, start + 3)
    const shade = `rgba(${SHADOW.rgb.join(',')},${SHADOW.alpha})`
    let shadowed = 0
    for (let y = 0; y < MASS_CELL; y++)
      for (let x = 0; x < MASS_CELL; x++) {
        if (corner[y][x] !== shade) continue
        shadowed++
        expect(x >= TILE || y >= TILE).toBe(true)
        expect(x).toBeGreaterThan(0)
        expect(y).toBeGreaterThan(0)
      }
    expect(shadowed).toBeGreaterThan(MASS_SHADOW * TILE)
    // An inner tile has no lowland beside it to shade.
    const inner = paint(h, map, start + 1, start + 1)
    expect(inner.flat().includes(shade)).toBe(false)
  })

  it('shades the pixels a neighbour shadows only once: each lowland pixel has one owner', () => {
    const map = 16
    const { h, start } = range(4, map)
    const shade = `rgba(${SHADOW.rgb.join(',')},${SHADOW.alpha})`
    const owners = new Map<string, number>()
    for (let y = start; y < start + 4; y++)
      for (let x = start; x < start + 4; x++) {
        const px = paint(h, map, x, y)
        for (let py = 0; py < MASS_CELL; py++)
          for (let pxx = 0; pxx < MASS_CELL; pxx++) {
            if (px[py][pxx] !== shade) continue
            const at = `${x * TILE + pxx},${y * TILE + py}`
            owners.set(at, (owners.get(at) ?? 0) + 1)
          }
      }
    expect(owners.size).toBeGreaterThan(0)
    expect([...owners.values()].every((n) => n === 1)).toBe(true)
  })

  it('gives tiles with the same surroundings the same cell key', () => {
    const map = 30
    const { h, start } = range(20, map)
    expect(massTileKey(h, map, map, start + 10, start, false)).toBe(
      massTileKey(h, map, map, start + 11, start, false),
    )
    expect(massTileKey(h, map, map, start, start + 10, false)).not.toBe(
      massTileKey(h, map, map, start + 10, start, false),
    )
    expect(massTileKey(h, map, map, start + 5, start + 5, true)).not.toBe(
      massTileKey(h, map, map, start + 5, start + 5, false),
    )
  })
})
