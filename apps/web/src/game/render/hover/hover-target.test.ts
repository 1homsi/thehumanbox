import { describe, expect, it } from 'vitest'
import { TILE } from '../../model/palette'
import { animalRect, buildingRect, nearestAnimal, personRect } from './hover-target'

describe('hover boxes', () => {
  it('boxes a person standing on their tile, head to feet', () => {
    const r = personRect({ x: 12, y: 5 }, 10, 3)
    const cx = 2 * TILE + TILE / 2
    const cy = 2 * TILE + TILE / 2
    expect(r.x + r.w / 2).toBe(cx)
    expect(r.y + r.h).toBeGreaterThan(cy)
    expect(r.y).toBeLessThan(cy - TILE / 2)
  })

  it('boxes an animal in the middle of its tile', () => {
    const r = animalRect({ x: 1, y: 1 }, 0, 0)
    expect(r.x + r.w / 2).toBe(TILE + TILE / 2)
    expect(r.y + r.h / 2).toBe(TILE + TILE / 2)
  })

  it('covers a building footprint from its top-left tile', () => {
    const r = buildingRect({ x: 5, y: 7, kind: 'Market', fw: 3, fh: 2 }, 1, 2)
    expect(r).toEqual({ x: 4 * TILE, y: 5 * TILE, w: 3 * TILE, h: 2 * TILE })
  })
})

describe('nearestAnimal', () => {
  const animals = [
    { id: 1, x: 10, y: 10 },
    { id: 2, x: 12, y: 10 },
  ]
  const centre = (x: number) => x * TILE + TILE / 2

  it('picks the animal closest to the point', () => {
    expect(nearestAnimal(animals, centre(11.8), centre(10), 0, 0)?.id).toBe(2)
    expect(nearestAnimal(animals, centre(10.1), centre(10), 0, 0)?.id).toBe(1)
  })

  it('finds nothing beyond the reach', () => {
    expect(nearestAnimal(animals, centre(20), centre(20), 0, 0)).toBeNull()
    expect(nearestAnimal([], 0, 0, 0, 0)).toBeNull()
  })
})
