import { describe, expect, it } from 'vitest'
import {
  ageWords,
  condition,
  doingNow,
  needLevel,
  standoutTraits,
  storyEvents,
  tribeName,
} from './person-words'
import { YEAR_TICKS } from './calendar'

const even = {
  curiosity: 0.5,
  aggression: 0.5,
  fear: 0.5,
  memory_strength: 0.5,
  social_tendency: 0.5,
  resilience: 0.5,
}
const well = { energy: 0.9, hydration: 0.9, health: 0.9, infection: 0, alive: true }

describe('person words', () => {
  it('names the traits that stand out most, in plain words', () => {
    expect(standoutTraits(even)).toEqual([])
    const words = standoutTraits({ ...even, aggression: 0.95, social_tendency: 0.2, curiosity: 0.6 }).map(
      (w) => w.word,
    )
    expect(words).toEqual(['hot-headed', 'loner'])
    expect(standoutTraits({ ...even, fear: 0.05 }, 4).map((w) => w.word)).toEqual(['fearless'])
    expect(standoutTraits(undefined)).toEqual([])
  })

  it('sums up how someone is doing from their worst need', () => {
    expect(condition(well)).toEqual({ level: 'good', word: 'doing well' })
    expect(condition({ ...well, energy: 0.1 })).toEqual({ level: 'bad', word: 'hungry' })
    expect(condition({ ...well, hydration: 0.4 })).toEqual({ level: 'fair', word: 'thirsty' })
    expect(condition({ ...well, infection: 0.5 })).toEqual({ level: 'bad', word: 'sick' })
    expect(condition({ ...well, alive: false }).level).toBe('bad')
    expect(needLevel(0.2)).toBe('bad')
  })

  it('says age as a life stage and whole years', () => {
    expect(ageWords({ age: YEAR_TICKS / 2 })).toBe('first year')
    expect(ageWords({ age: YEAR_TICKS * 3.7, age_stage: 'adult' })).toBe('adult, 3 yrs')
  })

  it('turns what they are doing into a readable line', () => {
    expect(doingNow('packing_shelter')).toBe('Packing shelter')
    expect(doingNow('')).toBe('Taking it easy')
    expect(tribeName('L', { L: 'Riznuk' })).toBe('Riznuk')
    expect(tribeName('L', {})).toBe('unnamed tribe')
  })

  it('keeps everyday chores and map coordinates out of the story unless nerds ask', () => {
    const log = [
      { tick: 1, category: 'event', text: 'drank from water at (408,335)' },
      { tick: 2, category: 'milestone', text: 'set out: founding new tribe toward (276, 352)' },
    ]
    expect(storyEvents(log, false).map((e) => e.text)).toEqual(['set out: founding new tribe'])
    expect(storyEvents(log, true).map((e) => e.text)).toEqual([
      'set out: founding new tribe toward (276, 352)',
      'drank from water at (408,335)',
    ])
  })
})
