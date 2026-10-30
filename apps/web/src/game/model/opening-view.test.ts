import { describe, expect, it } from 'vitest'
import { claimOpeningView, openingSpot, resetOpeningView } from './opening-view'

const person = (x: number, y: number, lineage_id: string, alive = true) => ({ x, y, lineage_id, alive })

describe('openingSpot', () => {
  it('looks at the biggest tribe, on one of its own people', () => {
    const spot = openingSpot([
      person(10, 10, 'small'),
      person(100, 50, 'big'),
      person(102, 52, 'big'),
      person(104, 54, 'big'),
    ])
    expect(spot).toEqual({ x: 102, y: 52 })
  })

  it('does not centre a tribe split over two shores on the sea between them', () => {
    const spot = openingSpot([person(0, 0, 'a'), person(1, 0, 'a'), person(100, 0, 'a')])
    expect(spot).toEqual({ x: 1, y: 0 })
  })

  it('counts only the living, and has nothing to look at in an empty world', () => {
    expect(openingSpot([person(5, 5, 'gone', false)])).toBeNull()
    expect(openingSpot([])).toBeNull()
    expect(openingSpot([person(5, 5, 'a', false), person(9, 9, 'b')])).toEqual({ x: 9, y: 9 })
  })

  it('opens on the same tribe each time when two are the same size', () => {
    const people = [person(1, 1, 'b'), person(50, 50, 'a')]
    expect(openingSpot(people)).toEqual({ x: 50, y: 50 })
    expect(openingSpot([...people].reverse())).toEqual({ x: 50, y: 50 })
  })
})

describe('claimOpeningView', () => {
  it('is granted once per page load', () => {
    resetOpeningView()
    expect(claimOpeningView()).toBe(true)
    expect(claimOpeningView()).toBe(false)
    resetOpeningView()
    expect(claimOpeningView()).toBe(true)
  })
})
