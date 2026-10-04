// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { SpriteLayer } from 'cubeforge'
import type { SceneOccupant } from '../../../scenes/core/types'
import { HUMAN_ATLAS_COLS } from '../../character-visuals'
import {
  HIT_RADIUS,
  idleBob,
  nightTint,
  occupantAt,
  pickOccupant,
  placeOccupants,
  type PlacedOccupant,
} from './room-model'

function occupant(id: string, over: Record<string, unknown> = {}): SceneOccupant {
  return {
    org: { id, name: id.toUpperCase(), sex: 'female', age: 30, max_age: 80, ...over },
    role: 'guest',
    activity: '',
  } as unknown as SceneOccupant
}

function lcg(seed: number) {
  let s = seed >>> 0
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32
}

describe('room occupants', () => {
  it('puts people on their slots, and a person without a slot in the middle of the room', () => {
    const placed = placeOccupants(
      [occupant('a'), occupant('b'), occupant('c')],
      [
        [4, 5],
        [9, 6],
      ],
    )
    expect(placed.map((o) => [o.px, o.py])).toEqual([
      [64, 80],
      [144, 96],
      [112, 80],
    ])
    expect(placed.every((o) => Number.isInteger(o.frame) && o.frame >= 0)).toBe(true)
  })

  it('addresses the people atlas row-major, four frames to a row', () => {
    const [a] = placeOccupants([occupant('a')], [[7, 5]])
    expect(a.frame % HUMAN_ATLAS_COLS).toBe(0)
  })

  it('breathes between two frames, out of step from person to person', () => {
    const frames = (i: number) => Array.from({ length: 400 }, (_, t) => idleBob(t * 16, i))
    expect(new Set(frames(0))).toEqual(new Set([0, -1]))
    expect(frames(0)).not.toEqual(frames(1))
  })

  it('tints people by the same factor the night multiply gives the room', () => {
    // multiply of rgba(40, 32, 50, 0.55) over white: 255 * (1 - 0.55 * (1 - c / 255)).
    const tint = nightTint()
    expect([(tint >>> 24) & 255, (tint >>> 16) & 255, (tint >>> 8) & 255, tint & 255]).toEqual([
      137, 132, 142, 255,
    ])
  })
})

describe('hit testing through SpriteLayer.pick()', () => {
  // Room positions the way the scenes lay people out: on a two-tile grid at least.
  function room(seed: number) {
    const r = lcg(seed)
    const cells = new Set<string>()
    const placed: PlacedOccupant[] = []
    while (placed.length < 1 + Math.floor(r() * 8)) {
      const cx = 2 + 2 * Math.floor(r() * 5)
      const cy = 2 + 2 * Math.floor(r() * 3)
      if (cells.has(cx + ',' + cy)) continue
      cells.add(cx + ',' + cy)
      placed.push({ id: 'p' + placed.length, name: '', px: cx * 16, py: cy * 16, frame: 0 })
    }
    const layer = new SpriteLayer({ visible: false })
    layer.resize(placed.length)
    placed.forEach((o, i) => {
      layer.x[i] = o.px
      layer.y[i] = o.py - 2
      layer.w[i] = layer.h[i] = HIT_RADIUS * 2
    })
    layer.touch()
    return { placed, layer, r }
  }

  it('finds the same person as the circle test everywhere in the room', () => {
    let hits = 0
    for (let seed = 1; seed <= 300; seed++) {
      const { placed, layer, r } = room(seed)
      for (let k = 0; k < 200; k++) {
        const x = r() * 224
        const y = r() * 160
        const expected = occupantAt(placed, x, y)
        expect(pickOccupant(layer, placed, x, y), `room ${seed} point ${x},${y}`).toBe(expected)
        if (expected) hits++
      }
    }
    expect(hits).toBeGreaterThan(500)
  })

  it('misses the corners of the box: the hit area is a circle', () => {
    const { placed, layer } = room(7)
    const o = placed[0]
    const corner = HIT_RADIUS * 0.95
    expect(layer.pick(o.px + corner, o.py - 2 + corner)).toBe(0)
    expect(pickOccupant(layer, placed, o.px + corner, o.py - 2 + corner)).toBeNull()
    expect(pickOccupant(layer, placed, o.px, o.py - 2)).toBe(o.id)
  })
})
