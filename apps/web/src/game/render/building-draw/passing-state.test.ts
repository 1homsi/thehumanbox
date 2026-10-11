import { describe, expect, it } from 'vitest'
import { LAUNCH_PERIOD } from '../era-traffic'
import { passingState } from './passing-state'

describe('passingState', () => {
  it('shows a shipyard hull only while one is on the slip', () => {
    expect(passingState({ id: 1, kind: 'Shipyard' }, 0)).toBeUndefined()
    expect(passingState({ id: 1, kind: 'Shipyard', slip: 1 }, 0)).toBe('hull1')
    expect(passingState({ id: 1, kind: 'Shipyard', slip: 2 }, 0)).toBe('hull2')
    expect(passingState({ id: 1, kind: 'Shipyard', slip: 3 }, 0)).toBe('hull3')
    // A stage out of range from an odd frame still draws a hull the painter knows.
    expect(passingState({ id: 1, kind: 'Shipyard', slip: 9 }, 0)).toBe('hull3')
  })

  it('keeps the spaceport pad empty after a launch and leaves other buildings alone', () => {
    const states = new Set<string | undefined>()
    for (let t = 0; t < LAUNCH_PERIOD; t += 50) states.add(passingState({ id: 3, kind: 'Spaceport' }, t))
    expect(states).toEqual(new Set(['empty', undefined]))
    expect(passingState({ id: 3, kind: 'House', slip: 2 }, 0)).toBeUndefined()
  })
})
