import { describe, expect, it } from 'vitest'
import { nearestLivingPerson } from './nearestPerson'

const person = (id: string, x: number, y: number, alive = true) => ({ id, x, y, alive })

describe('nearestLivingPerson', () => {
  it('picks the living person nearest the point within reach', () => {
    const people = [person('a', 10, 10), person('b', 12, 11), person('c', 40, 40)]
    expect(nearestLivingPerson(people, 12, 12, 4)?.id).toBe('b')
  })

  it('ignores the dead and anyone beyond reach', () => {
    const people = [person('dead', 12, 12, false), person('far', 30, 30)]
    expect(nearestLivingPerson(people, 12, 12, 4)).toBeNull()
  })

  it('keeps the earlier person when two are the same distance away', () => {
    const people = [person('first', 10, 10), person('second', 14, 10)]
    expect(nearestLivingPerson(people, 12, 10, 4)?.id).toBe('first')
  })

  it('accepts a person exactly at reach', () => {
    expect(nearestLivingPerson([person('edge', 16, 10)], 12, 10, 4)?.id).toBe('edge')
  })
})
