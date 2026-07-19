import { describe, expect, it } from 'vitest'
import { recoveryPrefix } from './wasmDb'

describe('recoveryPrefix', () => {
  it('names recovery saves under their world without colliding with the primary key', () => {
    expect(recoveryPrefix('browser-own')).toBe('browser-own:recovery:')
    expect('browser-own:recovery:123'.startsWith(recoveryPrefix('browser-own'))).toBe(true)
    expect('another:recovery:123'.startsWith(recoveryPrefix('browser-own'))).toBe(false)
  })
})
