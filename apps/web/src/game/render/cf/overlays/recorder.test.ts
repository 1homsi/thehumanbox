// @vitest-environment happy-dom
import { SPRITE_UNTEXTURED, SpriteLayer } from 'cubeforge'
import { beforeEach, describe, expect, it } from 'vitest'
import { GlyphSet } from './glyph-atlas'
import { SpriteRecorder } from './recorder'
import { ShapeAtlas } from './shape-atlas'
import { stubHost } from './test-support'

let shape: SpriteLayer
let text: SpriteLayer
let rec: SpriteRecorder
let ctx: CanvasRenderingContext2D
let atlas: ShapeAtlas
let glyphs: GlyphSet

beforeEach(() => {
  const host = stubHost()
  atlas = new ShapeAtlas(host)
  glyphs = new GlyphSet(host)
  shape = new SpriteLayer()
  text = new SpriteLayer()
  rec = new SpriteRecorder(shape, text, atlas, glyphs)
  rec.begin({ zoom: 1, dpr: 1 })
  ctx = rec.asContext()
})

const rgba = (c: number) => [(c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255, c & 255]

describe('SpriteRecorder as a canvas context', () => {
  it('turns fillRect into an untextured sprite centred on the rect, in the fill colour', () => {
    ctx.fillStyle = 'rgba(10,20,30,0.5)'
    ctx.fillRect(4, 6, 10, 2)
    expect(shape.count).toBe(1)
    expect([shape.x[0], shape.y[0], shape.w[0], shape.h[0]]).toEqual([9, 7, 10, 2])
    expect(shape.flags[0] & SPRITE_UNTEXTURED).toBeTruthy()
    expect(rgba(shape.color[0])).toEqual([10, 20, 30, 128])
  })

  it('applies globalAlpha on top of the colour alpha, and skips invisible fills', () => {
    ctx.fillStyle = 'rgba(255,0,0,0.5)'
    ctx.globalAlpha = 0.5
    ctx.fillRect(0, 0, 1, 1)
    expect(rgba(shape.color[0])[3]).toBe(64)
    ctx.globalAlpha = 0
    ctx.fillRect(0, 0, 1, 1)
    expect(shape.count).toBe(1)
  })

  it('composes translate, scale and rotate like the canvas, and restores them', () => {
    ctx.save()
    ctx.translate(100, 50)
    ctx.scale(2, 3)
    ctx.fillRect(1, 1, 4, 2)
    expect([shape.x[0], shape.y[0], shape.w[0], shape.h[0]]).toEqual([100 + 2 * 3, 50 + 3 * 2, 8, 6])
    ctx.restore()
    ctx.fillRect(0, 0, 2, 2)
    expect([shape.x[1], shape.y[1], shape.w[1]]).toEqual([1, 1, 2])
    ctx.save()
    ctx.translate(10, 10)
    ctx.rotate(Math.PI / 2)
    ctx.fillRect(0, 0, 4, 2)
    // Local centre (2, 1) rotated a quarter turn lands at (-1, 2) from the origin.
    expect(shape.x[2]).toBeCloseTo(9)
    expect(shape.y[2]).toBeCloseTo(12)
    expect(shape.rotation[2]).toBeCloseTo(Math.PI / 2)
    expect([shape.w[2], shape.h[2]].map((v) => Math.round(v))).toEqual([4, 2])
    ctx.restore()
  })

  it('restores fill style and alpha with the transform', () => {
    ctx.fillStyle = '#ff0000'
    ctx.save()
    ctx.fillStyle = '#00ff00'
    ctx.globalAlpha = 0.25
    ctx.restore()
    ctx.fillRect(0, 0, 1, 1)
    expect(rgba(shape.color[0])).toEqual([255, 0, 0, 255])
  })

  it('draws a filled circle path as a disc sprite, and a ring for a stroked one', () => {
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(20, 30, 5, 0, Math.PI * 2)
    ctx.fill()
    expect(shape.count).toBe(1)
    expect(shape.frame[0]).toBe(0)
    expect(shape.x[0]).toBe(20)
    expect(shape.w[0]).toBeGreaterThan(10)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(20, 30, 5, 0, Math.PI * 2)
    ctx.stroke()
    expect(shape.count).toBe(2)
    expect(shape.frame[1]).toBeGreaterThan(0)
  })

  it('draws one sprite per rect of a path, a stroked polyline as segments', () => {
    ctx.fillStyle = '#123456'
    ctx.beginPath()
    for (let i = 0; i < 5; i++) ctx.rect(i * 8, 0, 8, 8)
    ctx.fill()
    expect(shape.count).toBe(5)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(10, 0)
    ctx.lineTo(10, 10)
    ctx.stroke()
    expect(shape.count).toBe(7)
    expect(shape.w[5]).toBeCloseTo(10)
    expect(shape.h[5]).toBeCloseTo(1)
  })

  it('bakes a radial gradient once and tints it with the strongest stop', () => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 10)
    g.addColorStop(0, 'rgba(255,0,0,0.4)')
    g.addColorStop(1, 'rgba(255,0,0,0)')
    ctx.fillStyle = g
    for (let i = 0; i < 3; i++) ctx.fillRect(-10, -10, 20, 20)
    expect(shape.count).toBe(3)
    expect(new Set([shape.frame[0], shape.frame[1], shape.frame[2]]).size).toBe(1)
    expect(shape.frame[0]).toBeGreaterThan(0)
    expect(rgba(shape.color[0])[3]).toBe(102)
  })

  it('lays text out as one glyph sprite per character, honouring alignment', () => {
    ctx.font = 'bold 20px monospace'
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'left'
    ctx.fillText('ab c', 100, 100)
    expect(text.count).toBe(3) // spaces draw nothing
    const left = text.x[0]
    ctx.textAlign = 'center'
    ctx.fillText('ab c', 100, 100)
    // Same text, centred: shifted left by half its width.
    expect(text.x[3]).toBeLessThan(left)
    expect(ctx.measureText('abcd').width).toBeCloseTo(4 * ctx.measureText('a').width)
  })

  it('picks a larger glyph atlas when the text is shown larger on screen', () => {
    rec.begin({ zoom: 1, dpr: 1 })
    ctx = rec.asContext()
    ctx.font = '10px monospace'
    ctx.fillText('x', 0, 0)
    rec.begin({ zoom: 4, dpr: 2 })
    ctx = rec.asContext()
    ctx.font = '10px monospace'
    ctx.fillText('x', 0, 0)
    // The second frame wanted 80 device px, the first 10.
    expect(text.atlas[0]).toBeGreaterThanOrEqual(0)
    expect(glyphs.pick('normal', 80)).toBeGreaterThan(glyphs.pick('normal', 10))
  })

  it('counts what it cannot draw instead of throwing', () => {
    ctx.beginPath()
    ctx.arc(0, 0, 4, 0, 1)
    ctx.fill()
    ;(ctx as unknown as { drawImage: () => void }).drawImage()
    expect(rec.stats.unsupported['arc(partial)']).toBe(1)
    expect(rec.stats.unsupported['drawImage']).toBe(1)
  })

  it('starts every frame empty', () => {
    ctx.fillRect(0, 0, 1, 1)
    rec.begin({ zoom: 1, dpr: 1 })
    expect(shape.count).toBe(0)
    expect(text.count).toBe(0)
  })
})

describe('ShapeAtlas', () => {
  it('reuses frames for the same ring and gradient, and bakes at most once per shape', () => {
    const before = atlas.bakes
    const a = atlas.ring(0.1)
    const b = atlas.ring(0.1)
    expect(a).toBe(b)
    expect(atlas.bakes).toBe(before + 1)
    // Thicknesses close together share a bucket, so an animated radius does not re-bake.
    expect(atlas.ring(0.105)).toBe(a)
  })
})

describe('ShapeAtlas size', () => {
  it('starts with one row of cells and takes more only as frames need them', () => {
    const grown: Array<[number, number, number, number]> = []
    const a = new ShapeAtlas({
      register: () => undefined,
      unregister: () => undefined,
      dirty: (_id, x, y, w, h) => grown.push([x, y, w, h]),
    })
    // The painting context exists only in a real browser; here the atlas keeps its bookkeeping.
    expect(a.canvas.height).toBe(a.cell)
    expect(a.canvas.width).toBe(a.cell * a.cols)
    if (!a.canvas.getContext('2d')) return
    for (let i = 1; i <= 9; i++) a.ring(0.01 * i + (i > 5 ? 0.3 : 0))
    expect(a.canvas.height).toBeGreaterThan(a.cell)
    expect(grown.length).toBeGreaterThan(0)
  })
})

describe('outlined text', () => {
  it('writes the outline first, in the stroke colour around the glyphs, then the fill on top', () => {
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0,0,0,1)'
    ctx.strokeText('Ab', 50, 50)
    const outline = text.count
    // Eight shifted copies of each of the two glyphs.
    expect(outline).toBe(16)
    for (let i = 0; i < outline; i++) expect(rgba(text.color[i]).slice(0, 3)).toEqual([0, 0, 0])
    ctx.fillStyle = '#ffffff'
    ctx.fillText('Ab', 50, 50)
    expect(text.count).toBe(18)
    expect(rgba(text.color[outline]).slice(0, 3)).toEqual([255, 255, 255])
    // The outline reaches half the line width beyond the fill on each side.
    const xs = Array.from({ length: outline }, (_, i) => text.x[i])
    const fillX = text.x[outline]
    expect(Math.min(...xs)).toBeLessThan(fillX)
    expect(Math.max(...xs)).toBeGreaterThan(fillX)
  })
})
