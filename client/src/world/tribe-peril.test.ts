import { describe, expect, it } from 'vitest'
import { PERIL_HELP, perilOf, remainingLine } from './tribe-peril'

describe('tribe peril', () => {
  it('finds the tribe on the brink', () => {
    const world = {
      tribes_in_peril: [
        { lineage_id: 'a', tribe: 'Ashfolk', population: 3, peak: 20, cause: 'sickness' as const, since: 0 },
      ],
    }
    expect(perilOf(world, 'a')?.tribe).toBe('Ashfolk')
    expect(perilOf(world, 'b')).toBeNull()
    expect(perilOf({}, 'a')).toBeNull()
  })

  it('offers a power for every cause', () => {
    for (const help of Object.values(PERIL_HELP)) {
      expect(help.tool).toMatch(/^[a-z0-9]+$/)
      expect(help.reason.length).toBeGreaterThan(0)
    }
    expect(PERIL_HELP.thirst.tool).toBe('rain')
  })

  it('counts who is left', () => {
    expect(remainingLine(1)).toBe('the last one')
    expect(remainingLine(4)).toBe('only 4 left')
  })
})
