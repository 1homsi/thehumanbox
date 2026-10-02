import { describe, expect, it } from 'vitest'
import { lossLine, PERIL_HELP, perilOf, remainingLine, tribeHome } from './tribe-peril'

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

  it('finds where a tribe lives', () => {
    const settlements = [{ lineage_id: 'a', center: [40, 50] }] as never
    const organisms = [
      { lineage_id: 'b', x: 10, y: 20, alive: true },
      { lineage_id: 'b', x: 30, y: 40, alive: true },
    ] as never
    expect(tribeHome({ settlements, organisms }, 'a')).toEqual({ x: 40, y: 50 })
    expect(tribeHome({ settlements, organisms }, 'b')).toEqual({ x: 20, y: 30 })
    expect(tribeHome({ settlements, organisms }, 'c')).toBeNull()
  })

  it('tells what a tribe has lost lately, worst first', () => {
    expect(lossLine({ old_age: 1, war: 3, starvation: 2 })).toBe('3 to war · 2 to hunger · 1 to old age')
    expect(lossLine({ war: 1, beasts: 1, fire: 1, drowning: 1 })).toBe(
      '1 to beasts · 1 to drowning · 1 to fire',
    )
    expect(lossLine({})).toBeNull()
    expect(lossLine(undefined)).toBeNull()
  })
})
