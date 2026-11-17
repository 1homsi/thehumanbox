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

  it('reads the tribe and whether the damaged buildings were homes', () => {
    expect(
      parseCommandOutcome(
        '{"applied":true,"code":"disaster_buildings","count":2,"name":null,"buildings":2,"tribe":"Tiseznag","homes":true}',
      ),
    ).toMatchObject({ buildings: 2, tribe: 'Tiseznag', homes: true })
    const plain = parseCommandOutcome(
      '{"applied":true,"code":"healed","count":1,"name":null,"buildings":0,"tribe":null,"homes":false}',
    )
    expect(plain).not.toHaveProperty('tribe')
    expect(plain).not.toHaveProperty('homes')
  })

  it('returns null for anything that is not an outcome', () => {
    expect(parseCommandOutcome('')).toBeNull()
    expect(parseCommandOutcome('true')).toBeNull()
    expect(parseCommandOutcome('{"code":"healed"}')).toBeNull()
  })
})

describe('describeOutcome', () => {
  it('says whom a disaster hit', () => {
    expect(describeOutcome({ applied: true, code: 'disaster_killed', count: 3, name: null })).toBe(
      '3 people killed',
    )
    expect(describeOutcome({ applied: true, code: 'disaster_hurt', count: 1, name: 'Ada' })).toBe(
      'Ada was hurt',
    )
    expect(describeOutcome({ applied: true, code: 'disaster_buildings', count: 2, name: null })).toBe(
      'The disaster damaged 2 buildings',
    )
    expect(
      describeOutcome({
        applied: true,
        code: 'disaster_buildings',
        count: 1,
        name: null,
        buildings: 1,
        tribe: 'Tiseznag',
        homes: true,
        cause: 'tsunami',
      }),
    ).toBe("A tsunami damaged one of Tiseznag's homes")
    expect(
      describeOutcome({
        applied: true,
        code: 'disaster_hurt',
        count: 3,
        name: null,
        buildings: 4,
        homes: true,
        cause: 'earthquake',
      }),
    ).toBe('3 people hurt · An earthquake damaged 4 homes')
    expect(describeOutcome({ applied: true, code: 'disaster_in_reach', count: 5, name: null })).toBe(
      '5 people in its way',
    )
    expect(describeOutcome({ applied: true, code: 'disaster_none', count: 0, name: null })).toBe(
      'nobody was in its way',
    )
  })

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
