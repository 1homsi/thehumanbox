import { describe, expect, it } from 'vitest'
import { eventConcernsTribe, tribeEvents } from './tribe-events'

const scope = { name: 'Lupif', members: new Set(['Zuhe', 'Tosib']) }
const ev = (actor: string) => ({ actor })

describe('tribe events', () => {
  it('matches the tribe by name and its living people', () => {
    expect(eventConcernsTribe(ev('Lupif'), scope)).toBe(true)
    expect(eventConcernsTribe(ev('the Lupif'), scope)).toBe(true)
    expect(eventConcernsTribe(ev('Zuhe'), scope)).toBe(true)
    expect(eventConcernsTribe(ev('Pamil'), scope)).toBe(false)
    expect(eventConcernsTribe(ev('Stranger'), scope)).toBe(false)
  })

  it('takes the newest matching events up to the limit', () => {
    const events = [ev('Zuhe'), ev('Pamil'), ev('Lupif'), ev('Tosib'), ev('Pamil'), ev('Lupif')]
    expect(tribeEvents(events, scope, () => true, 3).map((e) => e.actor)).toEqual(['Lupif', 'Tosib', 'Lupif'])
    expect(tribeEvents(undefined, scope, () => true)).toEqual([])
  })

  it('applies the log filter too', () => {
    const events = [ev('Lupif'), ev('Zuhe')]
    expect(tribeEvents(events, scope, (e) => e.actor !== 'Zuhe').map((e) => e.actor)).toEqual(['Lupif'])
  })
})
