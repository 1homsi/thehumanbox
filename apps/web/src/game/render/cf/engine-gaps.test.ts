import { describe, expect, it } from 'vitest'
import { SPRITE_HIDDEN, SpriteLayer } from 'cubeforge'

/**
 * cubeforge 0.11.0 SpriteLayer behaviours the people/animals spike works around.
 * Each test states what a game would expect and what the engine does; if the
 * engine changes, the failing test is the cue to delete the workaround.
 */
describe('cubeforge 0.11.0 SpriteLayer behaviours the people/animals layers route around', () => {
  it('pick() hits the whole quad, transparent corners included, and has no tolerance radius', () => {
    const layer = new SpriteLayer({ atlases: [{}] })
    layer.add(100, 100, 20, 20, 0, 7)
    // a click on the empty corner of the cell still selects it
    expect(layer.pick(91, 91)).toBe(7)
    // one pixel outside misses: there is no touch-target padding or nearest search
    expect(layer.pick(89, 100)).toBe(-1)
  })

  it('ids are 32-bit numbers: string organism ids must be interned by the caller', () => {
    const layer = new SpriteLayer({ atlases: [{}] })
    layer.add(0, 0, 8, 8, 0, 0)
    expect(layer.ids).toBeInstanceOf(Int32Array)
    // "no hit" is -1, so an id of -1 is indistinguishable from a miss
    layer.ids[0] = -1
    expect(layer.pick(0, 0)).toBe(-1)
  })

  it('sort ties fall back to slot order, so a secondary key (id) cannot be expressed', () => {
    const layer = new SpriteLayer({ sortByKey: true, atlases: [{}] })
    for (const key of [5, 5, 5]) {
      const i = layer.add(0, 0, 4, 4)
      layer.sortKey[i] = key
    }
    expect(Array.from(layer.drawOrder().subarray(0, 3))).toEqual([0, 1, 2])
    // (since 0.13 the key is float64: two depths a ten-thousandth apart at y = 4000 stay apart)
    layer.sortKey[0] = 4000.0001
    layer.sortKey[1] = 4000.00005
    expect(layer.sortKey[0]).not.toBe(layer.sortKey[1])
  })

  it('hidden sprites still take part in the depth sort and pick order bookkeeping', () => {
    const layer = new SpriteLayer({ sortByKey: true, atlases: [{}] })
    const a = layer.add(0, 0, 4, 4)
    const b = layer.add(0, 0, 4, 4)
    layer.sortKey[a] = 2
    layer.sortKey[b] = 1
    layer.flags[a] = SPRITE_HIDDEN
    // the hidden sprite is still in the order array (the draw loop skips it later)
    expect(Array.from(layer.drawOrder().subarray(0, 2))).toEqual([b, a])
    expect(layer.pick(0, 0)).toBe(b)
  })

  it('clear() then add() bumps the structure counter, so every rebuild is a full sort', () => {
    const layer = new SpriteLayer({ sortByKey: true, atlases: [{}] })
    for (let i = 0; i < 4; i++) layer.sortKey[layer.add(0, 0, 4, 4)] = 4 - i
    layer.drawOrder()
    // Same count and same keys after a clear/add cycle: the order is still recomputed from scratch.
    // Observable only through timing; documented here because rebuilding at 10 Hz costs a full
    // n log n sort with a comparator closure for 3,000 people.
    const before = layer.version
    layer.clear()
    for (let i = 0; i < 4; i++) layer.sortKey[layer.add(0, 0, 4, 4)] = 4 - i
    expect(layer.version).toBeGreaterThan(before)
  })

  it('has one anchor per layer, not per sprite', () => {
    const layer = new SpriteLayer({ atlases: [{}], anchorX: 0.5, anchorY: 1 })
    layer.add(10, 10, 4, 4)
    layer.add(10, 10, 8, 8)
    // both quads hang from the same anchor: a person and a boat cannot differ without a second layer
    expect(layer.anchorX).toBe(0.5)
    expect(layer.anchorY).toBe(1)
    expect('anchorY' in layer && !('anchorYs' in layer)).toBe(true)
  })
})
