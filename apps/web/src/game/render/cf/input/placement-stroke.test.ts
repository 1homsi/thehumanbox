import { describe, expect, it } from 'vitest'
import { MAX_PLACEMENTS_PER_DRAG, PlacementStroke, placementSpacing } from './placement-stroke'

/** Walks a pointer through the given points, one move per point, and returns every placement. */
function drag(stroke: PlacementStroke, path: Array<[number, number]>) {
  return path.flatMap(([x, y]) => stroke.advance(x, y))
}

describe('placementSpacing', () => {
  it('spaces placements a tile beyond the brush, so the brush marks just touch', () => {
    expect(placementSpacing(0)).toBe(1)
    expect(placementSpacing(2)).toBe(3)
    expect(placementSpacing(4)).toBe(5)
    expect(placementSpacing(20)).toBe(21)
  })

  it('keeps a bad brush value inside the toolbar range', () => {
    expect(placementSpacing(-3)).toBe(1)
    expect(placementSpacing(99)).toBe(21)
    expect(placementSpacing(Number.NaN)).toBe(1)
  })
})

describe('PlacementStroke spacing', () => {
  it('places the press point and nothing more for a click that does not move', () => {
    const stroke = new PlacementStroke(3)
    expect(stroke.advance(10, 10)).toEqual([{ x: 10, y: 10 }])
    expect(stroke.advance(10.5, 10.2)).toEqual([])
    expect(stroke.count).toBe(1)
  })

  it('places along a straight drag every spacing units, starting from the press', () => {
    const stroke = new PlacementStroke(3)
    const placed = drag(stroke, [
      [0, 0],
      [4, 0],
      [9.5, 0],
    ])
    expect(placed).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 6, y: 0 },
      { x: 9, y: 0 },
    ])
  })

  it('accumulates small moves until a full spacing is covered', () => {
    const stroke = new PlacementStroke(3)
    const placed = drag(stroke, [
      [0, 0],
      [1, 0],
      [2, 0],
      [2.9, 0],
      [3.2, 0],
    ])
    // The press, then the first step once the pointer is 3 units from it.
    expect(placed).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ])
  })

  it('fills the path when the pointer jumps further than one spacing in a single move', () => {
    const stroke = new PlacementStroke(2)
    const placed = drag(stroke, [
      [0, 0],
      [7, 0],
    ])
    expect(placed.map((p) => p.x)).toEqual([0, 2, 4, 6])
  })

  it('keeps every placement on the line of a diagonal drag', () => {
    const stroke = new PlacementStroke(5)
    const placed = drag(stroke, [
      [0, 0],
      [30, 40],
    ])
    expect(placed.length).toBe(11)
    for (const p of placed) {
      expect(p.x * 4).toBeCloseTo(p.y * 3, 6)
    }
    const last = placed[placed.length - 1]
    expect(Math.hypot(last.x, last.y)).toBeCloseTo(50, 6)
  })

  it('places at a spacing of one tile for the smallest brush', () => {
    const stroke = new PlacementStroke(placementSpacing(0))
    const placed = drag(stroke, [
      [0, 5],
      [4, 5],
    ])
    expect(placed.map((p) => p.x)).toEqual([0, 1, 2, 3, 4])
  })
})

describe('PlacementStroke cap', () => {
  it('stops placing once a drag has used its cap, however far it goes', () => {
    const stroke = new PlacementStroke(1)
    const placed = drag(stroke, [
      [0, 0],
      [1000, 0],
    ])
    expect(placed.length).toBe(MAX_PLACEMENTS_PER_DRAG)
    expect(stroke.full).toBe(true)
    expect(stroke.advance(2000, 0)).toEqual([])
    expect(stroke.count).toBe(MAX_PLACEMENTS_PER_DRAG)
  })

  it('takes a custom cap', () => {
    const stroke = new PlacementStroke(2, 3)
    const placed = drag(stroke, [
      [0, 0],
      [100, 0],
    ])
    expect(placed.map((p) => p.x)).toEqual([0, 2, 4])
    expect(stroke.full).toBe(true)
  })

  it('still stops at the cap with the widest brush', () => {
    const stroke = new PlacementStroke(placementSpacing(20))
    const placed = drag(stroke, [
      [0, 0],
      [5000, 0],
    ])
    expect(placed.length).toBe(MAX_PLACEMENTS_PER_DRAG)
  })

  it('rejects a spacing that could never move the stroke forward', () => {
    expect(() => new PlacementStroke(0)).toThrow(RangeError)
    expect(() => new PlacementStroke(Number.NaN)).toThrow(RangeError)
  })
})
