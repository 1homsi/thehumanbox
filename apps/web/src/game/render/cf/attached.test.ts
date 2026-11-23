import { SpriteLayer } from 'xipjs'
import { describe, expect, it } from 'vitest'
import { ATTACHED_MIRROR, ATTACHED_SNAP, ATTACHED_UNTEXTURED, AttachedSprites } from './attached'

function setup() {
  const layer = new SpriteLayer({ atlases: [{}] })
  const attached = new AttachedSprites(layer)
  attached.begin()
  return { layer, attached }
}

describe('attached sprites that follow the way their owner faces', () => {
  const ownerX = Float32Array.of(100, 200)
  const ownerY = Float32Array.of(50, 60)
  const hidden = new Uint8Array(2)

  it('mirrors a centred sprite about the middle column of the figure', () => {
    const { layer, attached } = setup()
    const i = attached.push(0, -3, -4, 8, 8, 0, 0, 0xffffffff, ATTACHED_MIRROR)
    attached.place(ownerX, ownerY, hidden, 0, false, Uint8Array.of(0, 0))
    expect(layer.x[i]).toBe(97)
    attached.place(ownerX, ownerY, hidden, 0, false, Uint8Array.of(1, 0))
    expect(layer.x[i]).toBe(104)
    expect(layer.y[i]).toBe(46)
  })

  it('mirrors a snapped rectangle so it covers the mirrored pixels', () => {
    const { layer, attached } = setup()
    const options = ATTACHED_MIRROR | ATTACHED_SNAP | ATTACHED_UNTEXTURED
    const i = attached.push(1, 3, -6, 2, 5, 0, 0, 0xffffffff, options)
    attached.place(ownerX, ownerY, hidden, 0, false, Uint8Array.of(0, 0))
    expect(layer.x[i] - 1).toBe(203)
    attached.place(ownerX, ownerY, hidden, 0, false, Uint8Array.of(0, 1))
    expect(layer.x[i] - 1).toBe(196)
    expect(layer.x[i] + 1).toBe(198)
  })

  it('leaves sprites that are not mirrored, and callers that pass no facing, as they were', () => {
    const { layer, attached } = setup()
    const plain = attached.push(0, 5, 0, 4, 4, 0, 0, 0xffffffff)
    const mirrored = attached.push(0, 5, 0, 4, 4, 0, 0, 0xffffffff, ATTACHED_MIRROR)
    attached.place(ownerX, ownerY, hidden, 0, false, Uint8Array.of(1, 1))
    expect(layer.x[plain]).toBe(105)
    expect(layer.x[mirrored]).toBe(96)
    attached.place(ownerX, ownerY, hidden, 0)
    expect(layer.x[mirrored]).toBe(105)
  })

  it('reports a turn as a change, so the layer is redrawn', () => {
    const { layer, attached } = setup()
    attached.push(0, 5, 0, 4, 4, 0, 0, 0xffffffff, ATTACHED_MIRROR)
    attached.place(ownerX, ownerY, hidden, 0, false, Uint8Array.of(0, 0))
    const touched: number[] = []
    layer.touchRange = (i0: number, i1 = i0) => {
      touched.push(i0, i1)
    }
    attached.place(ownerX, ownerY, hidden, 0, false, Uint8Array.of(0, 0))
    expect(touched).toEqual([])
    attached.place(ownerX, ownerY, hidden, 0, false, Uint8Array.of(1, 0))
    expect(touched).toEqual([0, 0])
  })
})
