import { describe, expect, it } from 'vitest'
import type { GoalStatus } from '../../shared/types'
import { DIFFICULTY_ORDER, goalFraction, goalProgressText, goalsSummary } from './goals'

const survival: GoalStatus = {
  id: 'keep_three_tribes',
  title: 'Keep 3 tribes alive for 5 years',
  progress: 3,
  target: 5,
  done: false,
}
const iron: GoalStatus = {
  id: 'reach_iron_age',
  title: 'Reach the Iron Age',
  progress: 0,
  target: 1,
  done: false,
}

describe('goalsSummary', () => {
  it('counts the goals met while the world is still going', () => {
    const met = { ...iron, progress: 1, done: true }
    expect(goalsSummary([survival, met], null)).toEqual({
      done: 1,
      total: 2,
      lost: false,
      headline: '1 of 2 goals met.',
    })
  })

  it('says so when there are no goals yet', () => {
    expect(goalsSummary(undefined, undefined).headline).toBe('No goals yet.')
  })

  it('reports a lost world with the year and the day it ended', () => {
    // Tick 12000 is the first day of year 2, the abundance season (Summer).
    const summary = goalsSummary([survival, iron], 12000)
    expect(summary.lost).toBe(true)
    expect(summary.headline).toBe('Everyone died in year 2, Summer day 1.')
  })
})

describe('goal progress', () => {
  it('reads progress as a fraction and clamps it', () => {
    expect(goalFraction(survival)).toBeCloseTo(0.6)
    expect(goalFraction({ ...survival, progress: 9 })).toBe(1)
    expect(goalFraction({ ...survival, target: 0, progress: 0 })).toBe(0)
    expect(goalFraction({ ...iron, done: true })).toBe(1)
  })

  it('says how far a goal has got in words', () => {
    expect(goalProgressText(survival)).toBe('3 of 5')
    expect(goalProgressText(iron)).toBe('not yet')
    expect(goalProgressText({ ...iron, done: true })).toBe('met')
  })

  it('lists the difficulties from calm to harsh', () => {
    expect(DIFFICULTY_ORDER).toEqual(['calm', 'normal', 'harsh'])
  })
})
