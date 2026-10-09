import { describe, expect, it } from 'vitest'
import { personTitles } from './titles'

const living = { alive: true, is_elder: false }

describe('personTitles', () => {
  it('gives a plain working adult no title', () => {
    expect(personTitles(living)).toEqual([])
  })

  it('names the tribe ruler, the elders and the trade in that order', () => {
    expect(personTitles({ alive: true, is_elder: true, is_leader: true, specialty: 'healer' })).toEqual([
      'Chief',
      'Elder',
      'Healer',
    ])
  })

  it('capitalises a trade it has no word for', () => {
    expect(personTitles({ ...living, specialty: 'glassblower' })).toEqual(['Glassblower'])
  })

  it('keeps no title for the dead', () => {
    expect(personTitles({ alive: false, is_elder: true, is_leader: true, specialty: 'hunter' })).toEqual([])
  })
})
