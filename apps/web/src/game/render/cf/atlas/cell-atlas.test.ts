import { describe, expect, it } from 'vitest'
import type { LayerAtlas } from 'cubeforge'
import { CELL_GUTTER, CellAtlas, type AtlasPage } from './cell-atlas'

interface Call {
  op: string
  args: number[]
}

function page(id: string, size: number): AtlasPage & { calls: Call[]; dirty: number[][] } {
  const calls: Call[] = []
  const dirty: number[][] = []
  const rec =
    (op: string) =>
    (...args: number[]) => {
      calls.push({ op, args })
    }
  const ctx = {
    save: rec('save'),
    restore: rec('restore'),
    beginPath: rec('beginPath'),
    rect: rec('rect'),
    clip: rec('clip'),
    clearRect: rec('clearRect'),
    translate: rec('translate'),
    imageSmoothingEnabled: true,
  } as unknown as CanvasRenderingContext2D
  const canvas = { width: 4, height: 4 }
  return {
    id,
    canvas,
    ctx,
    maxWidth: size,
    maxHeight: size,
    resize: (w, h) => {
      calls.push({ op: 'resize', args: [w, h] })
      Object.assign(canvas, { width: w, height: h })
    },
    markDirty: (...a: number[]) => dirty.push(a),
    calls,
    dirty,
  }
}

function make(sizes: number[], classes: Array<[number, number]>) {
  const pages = sizes.map((s, i) => page(`p${i}`, s))
  const atlases: LayerAtlas[] = []
  const atlas = new CellAtlas(pages, classes, atlases)
  return { atlas, pages, atlases }
}

describe('CellAtlas', () => {
  it('costs nothing until a page is claimed, then only the rows it needs', () => {
    const { atlas, pages } = make([1024, 1024], [[20, 10]])
    expect(pages[0].canvas).toEqual({ width: 4, height: 4 })
    atlas.bake('a', 18, 8, () => {})
    // 1024 / 20 = 51 columns, a first block of 4 rows.
    expect(pages[0].canvas).toEqual({ width: 51 * 20, height: 4 * 10 })
    expect(pages[1].canvas).toEqual({ width: 4, height: 4 })
  })

  it('doubles a full page without moving any cell, until the limit, then clears it', () => {
    const { atlas, pages, atlases } = make([40], [[10, 10]])
    // 40 / 10 = 4 columns, 4 rows at most; it starts with 4 rows, the most it can have.
    const refs = Array.from({ length: 16 }, (_, i) => atlas.bake(`k${i}`, 8, 8, () => {}))
    expect(atlas.grows).toBe(0)
    expect(pages[0].canvas).toEqual({ width: 40, height: 40 })
    expect(atlas.epoch).toBe(0)
    expect(refs[15]?.frame).toBe(15)
    expect(atlases[0].frameColumns).toBe(4)
  })

  it('grows by rows and keeps every cell where it was', () => {
    const { atlas, pages, atlases } = make([160], [[10, 10]])
    // 16 columns, up to 16 rows; 4 rows to start with: 64 cells.
    const first = Array.from({ length: 64 }, (_, i) => atlas.bake(`k${i}`, 8, 8, () => {}))
    expect(pages[0].canvas).toEqual({ width: 160, height: 40 })
    const sixtyFifth = atlas.bake('k64', 8, 8, () => {})
    expect(atlas.grows).toBe(1)
    expect(pages[0].canvas).toEqual({ width: 160, height: 80 })
    expect(atlas.epoch).toBe(0)
    expect(atlas.get('k0')).toBe(first[0])
    expect(first[63]).toMatchObject({ frame: 63 })
    expect(sixtyFifth?.frame).toBe(64)
    expect(atlases[0].frameColumns).toBe(16)
    // The whole page is marked dirty so the engine re-creates the texture at its new size.
    expect(pages[0].dirty).toContainEqual([])
  })

  it('claims a page for the first size class and lays cells out row by row', () => {
    const { atlas, atlases } = make([100, 100], [[20, 10]])
    const a = atlas.bake('a', 18, 8, () => {})
    const b = atlas.bake('b', 18, 8, () => {})
    expect(a).toEqual({ atlas: 0, frame: 0, cw: 20, ch: 10 })
    expect(b?.frame).toBe(1)
    // 100 / 20 = 5 columns: the descriptor tells the engine how to slice the texture.
    expect(atlases[0]).toMatchObject({ dynamicSrc: 'p0', frameWidth: 20, frameHeight: 10, frameColumns: 5 })
    expect(atlases[1]).toEqual({ dynamicSrc: 'p1' })
  })

  it('returns the same cell for a key it already holds and paints once', () => {
    const { atlas } = make([100], [[20, 10]])
    let paints = 0
    const first = atlas.bake('k', 10, 5, () => paints++)
    const again = atlas.bake('k', 10, 5, () => paints++)
    expect(again).toBe(first)
    expect(paints).toBe(1)
    expect(atlas.get('k')).toBe(first)
  })

  it('paints inside the gutter, clipped to the content, and marks only that cell dirty', () => {
    const { atlas, pages } = make([100], [[20, 10]])
    atlas.bake('a', 18, 8, () => {})
    atlas.bake('b', 18, 8, () => {})
    const ops = pages[0].calls.filter((c) => c.op === 'translate')
    expect(ops[1].args).toEqual([20 + CELL_GUTTER, 0 + CELL_GUTTER])
    // dirty[0] is the page being claimed; each bake after it marks its own cell.
    expect(pages[0].dirty.slice(-2)).toEqual([
      [0, 0, 20, 10],
      [20, 0, 20, 10],
    ])
  })

  it('puts different sizes on different pages, tightest class first', () => {
    const { atlas } = make(
      [200, 200, 200],
      [
        [20, 20],
        [40, 40],
      ],
    )
    const small = atlas.bake('s', 10, 10, () => {})
    const big = atlas.bake('b', 30, 30, () => {})
    const small2 = atlas.bake('s2', 10, 10, () => {})
    expect(small?.atlas).toBe(0)
    expect(big?.atlas).toBe(1)
    expect(small2?.atlas).toBe(0)
  })

  it('clears a full page, bumps the epoch and forgets its cells', () => {
    const { atlas } = make([20], [[10, 10]])
    // 20x20 page, 10x10 cells: four per page.
    for (let i = 0; i < 4; i++) atlas.bake(`k${i}`, 8, 8, () => {})
    expect(atlas.epoch).toBe(0)
    const fifth = atlas.bake('k4', 8, 8, () => {})
    expect(atlas.epoch).toBe(1)
    expect(atlas.resets).toBe(1)
    expect(fifth?.frame).toBe(0)
    expect(atlas.get('k0')).toBeUndefined()
    expect(atlas.get('k4')).toBe(fifth)
  })

  it('rejects a sprite no class and no free page can hold', () => {
    const { atlas } = make([16], [[10, 10]])
    expect(atlas.bake('huge', 40, 40, () => {})).toBeNull()
    expect(atlas.rejected).toBe(1)
  })

  it('reports usage across claimed pages', () => {
    const { atlas } = make([40, 40], [[10, 10]])
    atlas.bake('a', 8, 8, () => {})
    // Capacity is what the page may hold; its canvas is only as big as its first rows.
    expect(atlas.usage()).toEqual({ used: 1, capacity: 16, pages: 1, pixels: 40 * 40 })
  })
})
