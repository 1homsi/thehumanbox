import { describe, expect, it } from 'vitest'
import { cargoColorOf } from './cargo'

describe('cargoColorOf', () => {
  it('gives each land good its own load colour', () => {
    const colors = ['clay', 'salt', 'ore', 'spice', 'ochre', 'fur'].map(cargoColorOf)
    expect(new Set(colors).size).toBe(colors.length)
  })

  it('falls back to a plain sack for a good with no colour', () => {
    expect(cargoColorOf('garment')).toBe('#8a6a48')
  })
})
