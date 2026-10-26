// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { SPRITE } from '../../shared/sprites'
import { TILE } from '../model/palette'
import type { PlacedAcacia, PlacedTree } from './decorations'
import { indexTrees, treeKindAt } from './tree-index'

/** A tree whose crown is centred in grid tile (col, row), as `placeTrees` places them. */
function treeAt(col: number, row: number, sprite: PlacedTree['sprite'] = SPRITE.trees.conifer): PlacedTree {
  const sz = 4
  return { cx: col * TILE + (TILE - sz) / 2, cy: row * TILE + (TILE - sz) / 2, sz, sprite }
}

describe('the tree index', () => {
  it('names the tree on each tile by what it is, and nothing on the empty tiles', () => {
    indexTrees([treeAt(2, 3), treeAt(5, 1, SPRITE.trees.bush)], [], 10, { x: 0, y: 0 })
    expect(treeKindAt(2.5, 3.5)).toBe('conifer')
    expect(treeKindAt(5.9, 1.1)).toBe('bush')
    expect(treeKindAt(4.5, 3.5)).toBeNull()
  })

  it('treats the sprites it does not name as plain trees, and reads acacias from their base', () => {
    const acacia: PlacedAcacia = { x: 4 * TILE + TILE / 2, y: 5 * TILE + TILE, s: 1 }
    indexTrees([treeAt(1, 1, SPRITE.trees.oak_dark)], [acacia], 10, { x: 0, y: 0 })
    expect(treeKindAt(1.5, 1.5)).toBe('tree')
    expect(treeKindAt(4.5, 5.5)).toBe('acacia')
  })

  it('is measured from the grid origin the trees were placed for', () => {
    indexTrees([treeAt(2, 3)], [], 10, { x: 100, y: 50 })
    expect(treeKindAt(102.5, 53.5)).toBe('conifer')
    expect(treeKindAt(2.5, 3.5)).toBeNull()
  })

  it('finds nothing outside the grid, and forgets the old trees when they are placed again', () => {
    indexTrees([treeAt(0, 0)], [], 10, { x: 0, y: 0 })
    expect(treeKindAt(-0.5, 0.5)).toBeNull()
    expect(treeKindAt(10.5, 0.5)).toBeNull()
    indexTrees([], [], 10, { x: 0, y: 0 })
    expect(treeKindAt(0.5, 0.5)).toBeNull()
  })
})
