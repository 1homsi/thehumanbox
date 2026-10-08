import { describe, expect, it } from 'vitest'
import { personName } from './personName'

describe('person name', () => {
  it('shows the generated name until the player gives one', () => {
    expect(personName({ name: 'Tomas' })).toBe('Tomas')
    expect(personName({ name: 'Tomas', custom_name: null })).toBe('Tomas')
  })

  it('shows the player-given name in place of the generated one', () => {
    expect(personName({ name: 'Tomas', custom_name: 'Mira' })).toBe('Mira')
  })

  it('ignores a blank custom name', () => {
    expect(personName({ name: 'Tomas', custom_name: '   ' })).toBe('Tomas')
  })
})
