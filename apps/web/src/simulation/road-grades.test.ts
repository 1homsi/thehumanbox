import { describe, expect, it } from 'vitest'
import type { GridWire } from '../shared/types'
import { applyGridWire } from './wire'

function wire(roads: [number, number, number][]): GridWire {
  return { width: 6, height: 4, origin_x: 0, origin_y: 0, fire: [], roads }
}

describe('road grades on the wire', () => {
  it('splits each road cell into its kind and the grade of the road it belongs to', () => {
    const grid = applyGridWire(
      wire([
        [1, 1, 1],
        [1, 2, 1 | (2 << 8)],
        [1, 3, 1 | (3 << 8)],
        [2, 2, 3],
      ]),
      null,
    )
    expect(grid.roads![1]!.slice(0, 4)).toEqual([0, 1, 1, 1])
    expect(grid.roads![2]![2]).toBe(3)
    expect(grid.road_grades![1]!.slice(0, 4)).toEqual([0, 0, 2, 3])
  })

  it('keeps no grade layer when no road has one', () => {
    const graded = applyGridWire(wire([[0, 0, 1 | (1 << 8)]]), null)
    const plain = applyGridWire(wire([[0, 0, 1]]), graded)
    expect(plain.roads![0]![0]).toBe(1)
    expect(plain.road_grades).toBeUndefined()
  })
})
