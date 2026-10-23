import { describe, expect, it } from 'vitest'
import { deathLine } from './death'

describe('deathLine', () => {
  it('names the cause and age of someone who died', () => {
    // Ages arrive in ticks and read in years, as on every other card.
    expect(deathLine({ alive: false, death_cause: 'starvation', age: 30_000 })).toBe(
      'Died of starvation at age 2.5 yrs',
    )
  })

  it('says nothing for the living or for an unknown cause', () => {
    expect(deathLine({ alive: true, death_cause: 'starvation', age: 30 })).toBeNull()
    expect(deathLine({ alive: false, age: 30 })).toBeNull()
    expect(deathLine({ alive: false, death_cause: '', age: 30 })).toBeNull()
  })
})
