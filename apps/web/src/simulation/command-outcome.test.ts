import { describe, expect, it } from 'vitest'
import { describeOutcome, FAILED_OUTCOME, parseCommandOutcome } from './command-outcome'

describe('parseCommandOutcome', () => {
  it('reads the outcome the simulation sends back', () => {
    expect(parseCommandOutcome('{"applied":true,"code":"healed","count":3,"name":null}')).toEqual({
      applied: true,
      code: 'healed',
      count: 3,
      name: null,
    })
  })

  it('reads the name of the one person a command touched', () => {
    expect(parseCommandOutcome('{"applied":true,"code":"revived","count":1,"name":"Kemi"}')?.name).toBe(
      'Kemi',
    )
  })

  it('returns null for anything that is not an outcome', () => {
    expect(parseCommandOutcome('')).toBeNull()
    expect(parseCommandOutcome('true')).toBeNull()
    expect(parseCommandOutcome('{"code":"healed"}')).toBeNull()
  })
})

describe('describeOutcome', () => {
  it('says how many people were healed', () => {
    const text = describeOutcome({ applied: true, code: 'healed', count: 3, name: null })
    expect(text).toBe('healed 3 people')
  })

  it('names the one person healed', () => {
    const text = describeOutcome({ applied: true, code: 'healed', count: 1, name: 'Kemi' })
    expect(text).toBe('healed Kemi')
  })

  it('says when nobody here needed healing, even though the command ran', () => {
    expect(describeOutcome({ applied: true, code: 'none_hurt', count: 0, name: null })).toBe(
      'no one here was hurt',
    )
  })

  it('says when there is no one to revive', () => {
    expect(describeOutcome({ applied: false, code: 'none_dead', count: 0, name: null })).toBe(
      'no one to revive here',
    )
  })

  it('leaves generic results to the tool line', () => {
    expect(describeOutcome({ applied: true, code: 'applied', count: 0, name: null })).toBeNull()
    expect(describeOutcome(FAILED_OUTCOME)).toBeNull()
  })
})
