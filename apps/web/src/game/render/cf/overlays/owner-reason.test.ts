import { describe, expect, it } from 'vitest'
import type { Building } from '../../../../shared/types'
import { OWNER_COLOURS, ownerReason } from './owner-reason'

const b = (over: Partial<Building>): Building => ({ id: 1, kind: 'hut', x: 0, y: 0, ...over }) as Building

describe('owner overlay', () => {
  it('tells town buildings, town scenery, strays, fading strays and ruins apart', () => {
    expect(ownerReason(b({ town: 3 }))).toBe('town')
    expect(ownerReason(b({ town: 3, decorative: true }))).toBe('scenery')
    expect(ownerReason(b({}))).toBe('stray')
    expect(ownerReason(b({ damage: 0.4 }))).toBe('fading')
    expect(ownerReason(b({ town: 3, ruined: true }))).toBe('ruin')
  })

  it('gives every reason its own colour', () => {
    const colours = Object.values(OWNER_COLOURS)
    expect(new Set(colours).size).toBe(colours.length)
  })
})
