import { describe, expect, it } from 'vitest'
import { pickToolEmoji, SPECIALTY_EMOJI } from '../draw-helpers'
import { characterFrame, characterMotion, type CharacterMotion } from '../character-visuals'
import { cssToRgba32, rgba32, withAlpha } from './colors'
import { MotionStore } from './motion'
import {
  BOAT_COLUMNS,
  DEGREE_EMOJI,
  boatColumn,
  boatVariantOf,
  FAUNA_KINDS,
  GLYPHS,
  GLYPH_COLUMNS,
  PIXEL_FAUNA_KINDS,
  SICK_EMOJI,
  TOOL_EMOJI,
  boatFrame,
  faunaCellKind,
  faunaDrawSize,
  glyphFrame,
  pixelFaunaFrame,
  pixelFaunaOffset,
} from './atlas-bake'
import { pixelFaunaDims } from '../pixel-fauna'
import { FAUNA_RECTS, faunaRect } from '../fauna-layout'
import { animalSize } from '../animal-visuals'

describe('cf colours', () => {
  it('parses the forms the canvas painter uses', () => {
    expect(cssToRgba32('#f2c84b')).toBe(rgba32(0xf2, 0xc8, 0x4b))
    expect(cssToRgba32('#fff')).toBe(0xffffffff)
    expect(cssToRgba32('rgb(10,20,30)')).toBe(rgba32(10, 20, 30))
    expect(cssToRgba32('rgba(255,68,136,0.5)')).toBe(rgba32(255, 68, 136, 128))
    // hsl(120, 100%, 50%) is pure green
    expect(cssToRgba32('hsl(120, 100%, 50%)')).toBe(rgba32(0, 255, 0))
    expect(cssToRgba32('hsl(0, 0%, 55%)')).toBe(rgba32(140, 140, 140))
  })

  it('multiplies alpha without touching the colour', () => {
    expect(withAlpha(rgba32(1, 2, 3, 200), 0.5)).toBe(rgba32(1, 2, 3, 100))
    expect(withAlpha(0xffffffff, 2)).toBe(0xffffffff)
    expect(withAlpha(0xffffffff, -1)).toBe(0xffffff00)
  })

  it('shows a bad colour as grey instead of dropping it', () => {
    expect(cssToRgba32('not a colour')).toBe(rgba32(128, 128, 128))
  })
})

describe('typed-array motion', () => {
  it('matches characterMotion and characterFrame over a walk with stops and a teleport', () => {
    const store = new MotionStore()
    store.reserve(1)
    let reference: CharacterMotion | undefined
    const phase = 413
    let x = 10
    let y = 20
    store.init(0, x, y)
    reference = characterMotion(undefined, x, y, 0, phase)
    for (let step = 1; step < 400; step++) {
      const now = step * 16.7
      if (step < 100) x += 0.013
      else if (step < 140) y -= 0.011
      else if (step === 200) x += 30
      else if (step > 250 && step < 300) x -= 0.02
      store.step(0, x, y, now)
      reference = characterMotion(reference, x, y, now, phase)
      expect(store.flipped[0] === 1).toBe(reference.flipped)
      expect(store.distance[0]).toBeCloseTo(reference.distance, 9)
      expect(store.movedAt[0]).toBe(reference.movedAt)
      expect(store.frame(0, now, phase, 4)).toBe(characterFrame(reference, now))
    }
  })

  it('carries state to a new slot', () => {
    const a = new MotionStore()
    const b = new MotionStore()
    a.reserve(4)
    b.reserve(4)
    a.init(3, 1, 2)
    a.step(3, 2, 2, 100)
    b.copyFrom(a, 3, 0)
    expect(b.lastX[0]).toBe(2)
    expect(b.movedAt[0]).toBe(100)
    expect(b.flipped[0]).toBe(0)
  })
})

describe('glyph atlas', () => {
  it('has a cell for every icon the canvas painter can print', () => {
    for (const emoji of Object.values(SPECIALTY_EMOJI)) expect(glyphFrame(emoji)).toBeGreaterThanOrEqual(0)
    for (const emoji of [SICK_EMOJI, DEGREE_EMOJI, ...TOOL_EMOJI])
      expect(glyphFrame(emoji)).toBeGreaterThanOrEqual(0)
    expect(glyphFrame('z')).toBeGreaterThanOrEqual(0)
    expect(glyphFrame('not a glyph')).toBe(-1)
    expect(new Set(GLYPHS).size).toBe(GLYPHS.length)
    expect(GLYPH_COLUMNS).toBe(8)
  })

  it('covers every tool emoji pickToolEmoji can return', () => {
    const tools = ['rifle', 'iron_sword', 'bronze_spear', 'bow', 'computer', 'book', 'hammer', 'plow']
    for (const tool of tools) {
      const emoji = pickToolEmoji({ [tool]: 1 })
      expect(emoji).not.toBe('')
      expect(TOOL_EMOJI).toContain(emoji)
    }
    expect(pickToolEmoji({})).toBe('')
  })
})

describe('boat frames', () => {
  it('cycles wake and stroke like drawBoat', () => {
    expect(boatFrame(false, false, 999)).toBe(0)
    expect(boatFrame(true, true, 999)).toBe(1)
    const seen = new Set<number>()
    for (let t = 0; t < 4000; t += 5) seen.add(boatFrame(true, false, t))
    expect([...seen].sort()).toEqual([2, 3, 4, 5, 6, 7])
    expect(BOAT_COLUMNS).toBe(64)
  })

  it('gives each era tier its hull and marks laden boats', () => {
    expect(boatVariantOf(undefined, 0)).toBe(0)
    expect(boatVariantOf('pre-stone', 0)).toBe(0)
    expect(boatVariantOf('bronze', 0)).toBe(2)
    expect(boatVariantOf('bronze', 3)).toBe(3)
    expect(boatVariantOf('classical', 0)).toBe(4)
    expect(boatVariantOf('renaissance', 0)).toBe(4)
    expect(boatVariantOf('modern', 0)).toBe(6)
    expect(boatVariantOf('industrial', 0)).toBe(6)
    expect(boatVariantOf('industrial', 1)).toBe(7)
    expect(boatColumn(7, 7)).toBe(BOAT_COLUMNS - 1)
  })
})

describe('animal atlases', () => {
  it('centres each pixel-art animal in its cell the way the painter centres it', () => {
    for (const kind of PIXEL_FAUNA_KINDS) {
      const d = pixelFaunaDims(kind)!
      const o = pixelFaunaOffset(kind)
      expect(o.x).toBe(Math.round(8 - d.cols / 2))
      expect(o.y).toBe(Math.round(8 - d.rows / 2))
      expect(o.x + d.cols).toBeLessThanOrEqual(16)
      expect(o.y + d.rows).toBeLessThanOrEqual(16)
    }
    const bear = PIXEL_FAUNA_KINDS.indexOf('bear') * 3
    expect(pixelFaunaFrame('bear', 0)).toBe(bear)
    expect(pixelFaunaFrame('bear', 3)).toBe(bear + 1)
    expect(pixelFaunaFrame('bear', 0, true)).toBe(bear + 2)
  })

  it('cuts fauna at the size fauna-sprites.ts draws them', () => {
    for (const cut of FAUNA_KINDS) {
      const [, , sw, sh] = FAUNA_RECTS[cut]
      const size = animalSize(cut === 'goldBird' ? 'bird' : cut)
      const scale = size / Math.max(sw, sh)
      const d = faunaDrawSize(cut)
      expect(d.w).toBe(Math.max(1, Math.round(sw * scale)))
      expect(d.h).toBe(Math.max(1, Math.round(sh * scale)))
      expect(Math.max(d.w, d.h)).toBeLessThanOrEqual(32)
    }
  })

  it('picks the same sheet rectangle as faunaRect for every kind', () => {
    for (const kind of ['rabbit', 'deer', 'boar', 'bird', 'wolf', 'dog', 'fish']) {
      for (const id of [0, 1, 2, 3]) {
        const cut = faunaCellKind(kind, id)!
        expect(FAUNA_RECTS[cut]).toBe(faunaRect(kind, id))
      }
    }
    expect(faunaCellKind('zombie', 1)).toBeNull()
  })
})
