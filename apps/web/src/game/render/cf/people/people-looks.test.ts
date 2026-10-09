import { describe, expect, it } from 'vitest'
import {
  HUMAN_ATLAS_CELL,
  HUMAN_ATLAS_HEIGHT,
  HUMAN_ATLAS_WIDTH,
  HUMAN_SHEET_APPEARANCES,
  humanAtlasRow,
} from '../../character-visuals'
import { expandPeopleSheet, hslToRgb, rgbToHsl, tintPixel } from './people-looks'

const CLOTH = [60, 120, 200] as const // a blue tunic
const SKIN = [216, 160, 112] as const // the sheet's skin
const GREY = [128, 128, 128] as const
const OUTLINE = [33, 25, 20] as const

describe('colour maths', () => {
  it('round-trips RGB through HSL', () => {
    for (const c of [CLOTH, SKIN, GREY, OUTLINE, [255, 0, 0], [0, 255, 0]] as const) {
      const [h, s, l] = rgbToHsl(c[0], c[1], c[2])
      const back = hslToRgb(h, s, l)
      for (let i = 0; i < 3; i++) expect(Math.abs(back[i] - c[i])).toBeLessThanOrEqual(1)
    }
  })
})

describe('tintPixel', () => {
  it('turns clothes and keeps greys, outlines and the identity tint', () => {
    const turned = tintPixel(CLOTH[0], CLOTH[1], CLOTH[2], { hue: 110, skin: 1 })
    expect(turned).not.toEqual([...CLOTH])
    expect(tintPixel(GREY[0], GREY[1], GREY[2], { hue: 200, skin: 1 })).toEqual([...GREY])
    expect(tintPixel(OUTLINE[0], OUTLINE[1], OUTLINE[2], { hue: 200, skin: 1 })).toEqual([...OUTLINE])
    expect(tintPixel(CLOTH[0], CLOTH[1], CLOTH[2], { hue: 0, skin: 1 })).toEqual([...CLOTH])
  })

  it('darkens or lightens skin without changing its hue much', () => {
    const [h0] = rgbToHsl(SKIN[0], SKIN[1], SKIN[2])
    const dark = tintPixel(SKIN[0], SKIN[1], SKIN[2], { hue: 290, skin: 0.8 })
    const [h1, , l1] = rgbToHsl(dark[0], dark[1], dark[2])
    const [, , l0] = rgbToHsl(SKIN[0], SKIN[1], SKIN[2])
    expect(Math.abs(h1 - h0)).toBeLessThan(3)
    expect(l1).toBeLessThan(l0)
  })
})

describe('expandPeopleSheet', () => {
  const SHEET_ROWS = 2 * 5 * HUMAN_SHEET_APPEARANCES
  const src = new Uint8ClampedArray(HUMAN_ATLAS_WIDTH * SHEET_ROWS * HUMAN_ATLAS_CELL * 4)
  // Paint each sheet figure a distinct clothing colour so every row can be told apart.
  for (let row = 0; row < SHEET_ROWS; row++) {
    for (let y = 0; y < HUMAN_ATLAS_CELL; y++) {
      for (let x = 0; x < HUMAN_ATLAS_WIDTH; x++) {
        const i = ((row * HUMAN_ATLAS_CELL + y) * HUMAN_ATLAS_WIDTH + x) * 4
        src[i] = 60 + row
        src[i + 1] = 120
        src[i + 2] = 200 - row
        src[i + 3] = 255
      }
    }
  }
  const dst = new Uint8ClampedArray(HUMAN_ATLAS_WIDTH * HUMAN_ATLAS_HEIGHT * 4)
  expandPeopleSheet(src, HUMAN_ATLAS_WIDTH, dst)

  const pixel = (buf: Uint8ClampedArray, row: number) => {
    const i = row * HUMAN_ATLAS_CELL * HUMAN_ATLAS_WIDTH * 4
    return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]]
  }

  it('keeps the sheet exactly for the first look of every figure', () => {
    for (const sex of [0, 1] as const) {
      for (const stage of ['infant', 'child', 'teen', 'adult', 'elder'] as const) {
        for (let figure = 0; figure < HUMAN_SHEET_APPEARANCES; figure++) {
          const look = humanAtlasRow(sex === 0 ? 'male' : 'female', stage, figure)
          const sheetRow =
            (sex * 5 + ['infant', 'child', 'teen', 'adult', 'elder'].indexOf(stage)) * 6 + figure
          expect(pixel(dst, look)).toEqual(pixel(src, sheetRow))
        }
      }
    }
  })

  it('gives the tinted looks of a figure different clothes', () => {
    const base = humanAtlasRow('male', 'adult', 2)
    const tinted = humanAtlasRow('male', 'adult', 2 + HUMAN_SHEET_APPEARANCES)
    expect(pixel(dst, tinted)).not.toEqual(pixel(dst, base))
    expect(pixel(dst, tinted)[3]).toBe(255)
  })

  it('leaves transparent pixels transparent', () => {
    const blank = new Uint8ClampedArray(src.length)
    const out = new Uint8ClampedArray(dst.length)
    expandPeopleSheet(blank, HUMAN_ATLAS_WIDTH, out)
    expect(out.every((v) => v === 0)).toBe(true)
  })

  it('gives every pixel the tint of its own colour, however many colours the sheet has', () => {
    // A sheet of many colours, with some transparent pixels: the colour cache must not change any pixel.
    const noisy = new Uint8ClampedArray(src.length)
    let seed = 7
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (let i = 0; i < noisy.length; i += 4) {
      noisy[i] = Math.floor(rand() * 256)
      noisy[i + 1] = Math.floor(rand() * 256)
      noisy[i + 2] = Math.floor(rand() * 256)
      noisy[i + 3] = rand() < 0.1 ? 0 : 255
    }
    const out = new Uint8ClampedArray(dst.length)
    expandPeopleSheet(noisy, HUMAN_ATLAS_WIDTH, out)
    const perRow = HUMAN_ATLAS_CELL * HUMAN_ATLAS_WIDTH
    let mismatches = 0
    for (let sex = 0; sex < 2; sex++) {
      for (let stage = 0; stage < 5; stage++) {
        for (let look = 0; look < 24; look++) {
          const figure = look % HUMAN_SHEET_APPEARANCES
          const tint = [
            { hue: 0, skin: 1 },
            { hue: 110, skin: 0.9 },
            { hue: 200, skin: 1.08 },
            { hue: 290, skin: 0.8 },
          ][Math.floor(look / HUMAN_SHEET_APPEARANCES)]
          const sheetRow = (sex * 5 + stage) * HUMAN_SHEET_APPEARANCES + figure
          const outRow = (sex * 5 + stage) * 24 + look
          for (let p = 0; p < perRow; p++) {
            const si = (sheetRow * perRow + p) * 4
            const oi = (outRow * perRow + p) * 4
            const a = noisy[si + 3]
            const want =
              a === 0 || tint.hue === 0
                ? [noisy[si], noisy[si + 1], noisy[si + 2]]
                : tintPixel(noisy[si], noisy[si + 1], noisy[si + 2], tint)
            if (
              out[oi] !== want[0] ||
              out[oi + 1] !== want[1] ||
              out[oi + 2] !== want[2] ||
              out[oi + 3] !== a
            )
              mismatches++
          }
        }
      }
    }
    expect(mismatches).toBe(0)
  })
})
