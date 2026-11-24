import { describe, expect, it } from 'vitest'
import { SPRITE_UNTEXTURED, SpriteLayer } from 'xipjs'
import { TILE } from '../../../model/palette'
import { writeSprite, WHITE } from '../frame'
import {
  OCCLUDER_SLOTS,
  OccluderMirror,
  WALKER_ATLAS_SLOTS,
  registerOccluders,
  treeGroundLine,
  walkerAtlases,
} from './occluders'

function walkerLayer() {
  const layer = new SpriteLayer({ atlases: walkerAtlases([{ dynamicSrc: 'people' }]), sortByKey: true })
  layer.add(0, 0, 16, 16, 0, 0)
  layer.sortKey[0] = 10
  return layer
}

function treeLayer() {
  const layer = new SpriteLayer({ atlases: [{ dynamicSrc: 'trees' }], sortByKey: true })
  layer.resize(2)
  writeSprite(layer, 0, 40, 76, 8, 2, 0, 0, WHITE, SPRITE_UNTEXTURED, -1, 0)
  writeSprite(layer, 1, 40, 70, 12, 16, 0, 3, WHITE, 0, 84, 0)
  return layer
}

describe('occluder copies', () => {
  it('fills a walker layer to the slots the copies use', () => {
    expect(walkerAtlases([{ dynamicSrc: 'a' }, { dynamicSrc: 'b' }])).toHaveLength(WALKER_ATLAS_SLOTS)
  })

  it('copies a tree after the walkers, keyed by its foot, and leaves its shadow out', () => {
    const walkers = walkerLayer()
    const trees = treeLayer()
    const off = registerOccluders('test-trees', {
      layer: trees,
      atlases: trees.atlases,
      ...OCCLUDER_SLOTS.trees,
      groundLine: treeGroundLine,
    })
    const mirror = new OccluderMirror(walkers)
    expect(mirror.sync(1, 0, true, true)).toBe(true)
    expect(walkers.count).toBe(2)
    expect(walkers.atlas[1]).toBe(OCCLUDER_SLOTS.trees.slot)
    expect(walkers.frame[1]).toBe(3)
    expect(walkers.sortKey[1]).toBeCloseTo((84 - TILE / 2) / TILE)
    expect(walkers.ids[1]).toBe(-1)
    expect(walkers.atlases[OCCLUDER_SLOTS.trees.slot]).toBe(trees.atlases[0])
    expect(mirror.sync(1, 0, true)).toBe(false)
    trees.touch()
    expect(mirror.sync(1, 0, true)).toBe(true)
    off()
  })

  it('draws someone north of the foot before the tree and someone south of it after', () => {
    const walkers = walkerLayer()
    const trees = treeLayer()
    const off = registerOccluders('test-trees', {
      layer: trees,
      atlases: trees.atlases,
      ...OCCLUDER_SLOTS.trees,
      groundLine: treeGroundLine,
    })
    const mirror = new OccluderMirror(walkers)
    walkers.sortKey[0] = 9
    mirror.sync(1, 0, true, true)
    expect(Array.from(walkers.drawOrder().slice(0, walkers.orderCount))).toEqual([0, 1])
    walkers.sortKey[0] = 11
    walkers.touch()
    expect(Array.from(walkers.drawOrder().slice(0, walkers.orderCount))).toEqual([1, 0])
    off()
  })

  it('removes the copies when the view is far', () => {
    const walkers = walkerLayer()
    const trees = treeLayer()
    const off = registerOccluders('test-trees', {
      layer: trees,
      atlases: trees.atlases,
      ...OCCLUDER_SLOTS.trees,
      groundLine: treeGroundLine,
    })
    const mirror = new OccluderMirror(walkers)
    mirror.sync(1, 0, true, true)
    expect(mirror.sync(1, 0, false)).toBe(true)
    expect(walkers.count).toBe(1)
    off()
  })
})
