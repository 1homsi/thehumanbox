import { describe, expect, it } from 'vitest'
import { cellsWhere, forCellsInView } from './cell-index'

const grid = [
  [0, 1, 0, 1],
  [1, 0, 0, 0],
  [0, 0, 1, 1],
]
const ones = (g: number[][]) => cellsWhere(g, 'ones', (r, c) => g[r][c] === 1)

describe('cellsWhere', () => {
  it('lists the matching cells as row, col pairs in row-major order', () => {
    expect(Array.from(ones(grid))).toEqual([0, 1, 0, 3, 1, 0, 2, 2, 2, 3])
  })

  it('finds the cells once per grid array, and again for a new one', () => {
    let looks = 0
    const g = grid.map((r) => [...r])
    const test = (r: number, c: number) => {
      looks++
      return g[r][c] === 1
    }
    const first = cellsWhere(g, 'k', test)
    expect(cellsWhere(g, 'k', test)).toBe(first)
    expect(looks).toBe(12)
    cellsWhere(
      g.map((r) => [...r]),
      'k',
      test,
    )
    expect(looks).toBe(24)
  })

  it('looks again when the second grid it read changes', () => {
    const g = grid.map((r) => [...r])
    const a = [[1]]
    const first = cellsWhere(g, 'with', () => true, a)
    expect(cellsWhere(g, 'with', () => true, a)).toBe(first)
    expect(cellsWhere(g, 'with', () => false, [[1]]).length).toBe(0)
  })
})

describe('forCellsInView', () => {
  const visit = (view: { c0: number; c1: number; r0: number; r1: number; ox: number; oy: number }) => {
    const seen: string[] = []
    forCellsInView(ones(grid), view, (r, c) => {
      seen.push(`${r},${c}`)
    })
    return seen
  }

  it('visits only the cells inside the window, in row-major order', () => {
    expect(visit({ c0: 1, c1: 4, r0: 0, r1: 3, ox: 0, oy: 0 })).toEqual(['0,1', '0,3', '2,2', '2,3'])
    expect(visit({ c0: 0, c1: 4, r0: 1, r1: 2, ox: 0, oy: 0 })).toEqual(['1,0'])
  })

  it('reads the window in sim tiles, offset by the grid origin', () => {
    expect(visit({ c0: 12, c1: 14, r0: 22, r1: 23, ox: 10, oy: 20 })).toEqual(['2,2', '2,3'])
  })

  it('stops when the visitor says so', () => {
    const seen: number[] = []
    forCellsInView(ones(grid), { c0: 0, c1: 4, r0: 0, r1: 3, ox: 0, oy: 0 }, (r) => {
      seen.push(r)
      return seen.length < 2
    })
    expect(seen).toHaveLength(2)
  })
})
