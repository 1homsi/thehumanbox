import { describe, expect, it } from 'vitest'
import { litPips, PROGRESS_PIPS } from './construction'

describe('construction progress pips', () => {
  it('lights one pip per fifth of the work and none before the first', () => {
    expect(PROGRESS_PIPS).toBe(5)
    expect(litPips(0)).toBe(0)
    expect(litPips(0.19)).toBe(0)
    expect(litPips(0.2)).toBe(1)
    expect(litPips(0.62)).toBe(3)
    expect(litPips(0.99)).toBe(4)
    expect(litPips(1)).toBe(5)
  })

  it('stays in range for odd input', () => {
    expect(litPips(-1)).toBe(0)
    expect(litPips(7)).toBe(5)
    expect(litPips(Number.NaN)).toBe(0)
  })
})
