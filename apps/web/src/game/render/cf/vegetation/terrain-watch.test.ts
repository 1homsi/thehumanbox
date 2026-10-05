import { describe, expect, it } from 'vitest'
import { TerrainWatch } from './terrain-watch'

const grid = (fill: number, w = 6, h = 4) => Array.from({ length: h }, () => new Array<number>(w).fill(fill))

describe('TerrainWatch', () => {
  it('reports the first terrain it sees, then nothing while it is unchanged', () => {
    const w = new TerrainWatch()
    const tiles = grid(1)
    const biomes = grid(0)
    expect(w.update(tiles, biomes, 6, 4, 0, 0, 'summer')).toBe(true)
    expect(w.update(tiles, biomes, 6, 4, 0, 0, 'summer')).toBe(false)
    expect(w.revision).toBe(1)
  })

  it('does not rebuild for a re-sent grid with identical ground, or for food growing', () => {
    const w = new TerrainWatch()
    const biomes = grid(0)
    w.update(grid(1), biomes, 6, 4, 0, 0, 'summer')
    expect(w.update(grid(1), biomes, 6, 4, 0, 0, 'summer')).toBe(false)
    // Food is grass for decoration purposes (terrainVisualSignature).
    const food = grid(1)
    food[2][3] = 3
    expect(w.update(food, biomes, 6, 4, 0, 0, 'summer')).toBe(false)
    expect(w.revision).toBe(1)
  })

  it('rebuilds when a tile changes kind, the biomes change, or the season turns', () => {
    const w = new TerrainWatch()
    const biomes = grid(0)
    w.update(grid(1), biomes, 6, 4, 0, 0, 'summer')
    const burnt = grid(1)
    burnt[1][1] = 4
    expect(w.update(burnt, biomes, 6, 4, 0, 0, 'summer')).toBe(true)
    const other = grid(0)
    other[0][0] = 1
    expect(w.update(burnt, other, 6, 4, 0, 0, 'summer')).toBe(true)
    expect(w.update(burnt, other, 6, 4, 0, 0, 'autumn')).toBe(true)
    expect(w.revision).toBe(4)
  })

  it('waits for tiles and biomes, and rebuilds when the world is resized or moved', () => {
    const w = new TerrainWatch()
    expect(w.update(undefined, grid(0), 6, 4, 0, 0, 'summer')).toBe(false)
    expect(w.update(grid(1), undefined, 6, 4, 0, 0, 'summer')).toBe(false)
    expect(w.update(grid(1), grid(0), 6, 4, 0, 0, 'summer')).toBe(true)
    expect(w.update(grid(1, 8, 4), grid(0, 8, 4), 8, 4, 0, 0, 'summer')).toBe(true)
    expect(w.update(grid(1, 8, 4), grid(0, 8, 4), 8, 4, 5, 0, 'summer')).toBe(true)
  })
})
