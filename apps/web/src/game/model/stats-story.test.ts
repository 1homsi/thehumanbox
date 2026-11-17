import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../shared/types'
import {
  deathCauses,
  ideasKnown,
  populationStory,
  relationsStory,
  traitLevel,
  yearStory,
} from './stats-story'
import { YEAR_TICKS } from './calendar'

const alive = (n: number, energy = 0.8) => Array.from({ length: n }, () => ({ alive: true, energy }))

describe('the population story', () => {
  it('is just beginning without a history', () => {
    expect(populationStory({ tick: 0, pop_history: [], organisms: alive(4) })).toMatchObject({
      now: 4,
      span: null,
      why: 'young',
    })
  })

  it('compares with a year ago and says food is plentiful when growing', () => {
    const story = populationStory({
      tick: YEAR_TICKS * 2,
      pop_history: [
        [0, 10],
        [YEAR_TICKS, 50],
        [YEAR_TICKS * 2 - 100, 60],
      ],
      organisms: alive(62),
    })
    expect(story).toMatchObject({ change: 12, span: 'year', trend: 'up', why: 'food' })
  })

  it('names the biggest loss when shrinking', () => {
    const story = populationStory({
      tick: 900,
      pop_history: [
        [0, 40],
        [600, 30],
      ],
      organisms: alive(20),
      tribe_losses: { a: { war: 3, starvation: 1 }, b: { war: 2 } },
    })
    expect(story).toMatchObject({ span: 'start', trend: 'down', why: 'deaths', cause: 'war' })
  })

  it('notices hunger while growing', () => {
    const story = populationStory({
      tick: 900,
      pop_history: [
        [0, 5],
        [600, 6],
      ],
      organisms: alive(10, 0.1),
    })
    expect(story.why).toBe('tightFood')
  })
})

describe('the year so far', () => {
  it('reads the current year', () => {
    expect(yearStory({ births_by_year: [5, 30], deaths_by_year: [2, 10] })).toEqual({
      born: 30,
      died: 10,
      why: 'boom',
    })
    expect(yearStory({ births_by_year: [5], deaths_by_year: [9] }).why).toBe('fewer')
    expect(yearStory({}).why).toBe('quiet')
  })
})

describe('ideas, ties, traits and deaths', () => {
  it('counts what the living know, most known first', () => {
    const ideas = ideasKnown([
      { alive: true, discoveries: ['fire', 'wood'] },
      { alive: true, discoveries: ['fire'] },
      { alive: false, discoveries: ['bronze'] },
    ])
    expect(ideas.map((i) => [i.id, i.people, i.share])).toEqual([
      ['fire', 2, 1],
      ['wood', 1, 0.5],
    ])
  })

  it('reads the mood between tribes', () => {
    const rel = (status: string) => ({ status }) as NonNullable<WorldState['tribal_relations']>[number]
    expect(relationsStory({ tribal_relations: [] }).mood).toBe('alone')
    expect(relationsStory({ tribal_relations: [rel('ally'), rel('neutral')] }).mood).toBe('peace')
    expect(relationsStory({ tribal_relations: [rel('neutral')] }).mood).toBe('met')
    expect(relationsStory({ tribal_relations: [rel('rivals'), rel('rivals'), rel('ally')] }).mood).toBe(
      'tense',
    )
    const battles = [{ attackers: ['a'], defenders: ['b'], ended: false }] as unknown as WorldState['battles']
    expect(relationsStory({ tribal_relations: [rel('ally')], battles })).toMatchObject({
      mood: 'war',
      wars: 1,
    })
  })

  it('turns a trait into a word', () => {
    expect([0.1, 0.4, 0.5, 0.6, 0.9].map(traitLevel)).toEqual([
      'veryLow',
      'low',
      'average',
      'high',
      'veryHigh',
    ])
  })

  it('lists causes of death without the empty ones, biggest first', () => {
    expect(deathCauses({ deaths_old_age: 2, deaths_combat: 5, deaths_fire: 0 })).toEqual([
      { cause: 'combat', count: 5 },
      { cause: 'oldAge', count: 2 },
    ])
  })
})
