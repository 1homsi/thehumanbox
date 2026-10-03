import { describe, expect, it } from 'vitest'
import type { TribePeril } from '../../shared/types'
import { newPerils } from './peril-watch'

const peril = (id: string): TribePeril => ({
  lineage_id: id,
  tribe: id,
  population: 3,
  peak: 20,
  cause: 'dwindling',
  since: 0,
})

describe('peril watch', () => {
  it('announces a tribe once while it stays in peril, and again if it falls anew', () => {
    const seen = new Set<string>()
    expect(newPerils(seen, [peril('a')]).map((p) => p.lineage_id)).toEqual(['a'])
    expect(newPerils(seen, [peril('a')])).toEqual([])
    expect(newPerils(seen, [peril('a'), peril('b')]).map((p) => p.lineage_id)).toEqual(['b'])
    expect(newPerils(seen, [])).toEqual([])
    expect(newPerils(seen, [peril('a')]).map((p) => p.lineage_id)).toEqual(['a'])
  })

  it('copes with no peril list at all', () => {
    expect(newPerils(new Set(), undefined)).toEqual([])
  })
})
