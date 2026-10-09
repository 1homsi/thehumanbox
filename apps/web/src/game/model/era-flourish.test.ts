import { describe, expect, it } from 'vitest'
import { EraWatch, FLOURISH_TICKS, eraRows } from './era-flourish'

const world = (
  tick: number,
  eras: Record<string, string> | Array<{ lineage_id: string; era_name: string }>,
) => ({
  tick,
  lineage_eras: eras,
})

describe('era watch', () => {
  it('reads both wire forms of the eras', () => {
    expect(eraRows(world(0, { red: 'pre-stone', blue: 'bronze' }))).toEqual([
      ['red', 'pre stone'],
      ['blue', 'bronze'],
    ])
    expect(eraRows(world(0, [{ lineage_id: 'red', era_name: 'iron' }]))).toEqual([['red', 'iron']])
    expect(eraRows({ lineage_eras: undefined })).toEqual([])
  })

  it('does not count the first sight of a tribe as an advance', () => {
    const watch = new EraWatch()
    expect(watch.update(world(100, { red: 'pre-stone' }))).toEqual([])
    expect(watch.active(100)).toEqual([])
  })

  it('marks a tribe that moves on to a new era, for FLOURISH_TICKS', () => {
    const watch = new EraWatch()
    watch.update(world(100, { red: 'pre-stone', blue: 'bronze' }))
    const found = watch.update(world(120, { red: 'stone', blue: 'bronze' }))
    expect(found).toEqual([{ lineage: 'red', era: 'stone', tick: 120 }])
    expect(watch.active(120)).toEqual(found)
    expect(watch.active(120 + FLOURISH_TICKS - 1)).toHaveLength(1)
    expect(watch.active(120 + FLOURISH_TICKS)).toEqual([])
  })

  it('reports an advance once, however many frames show it', () => {
    const watch = new EraWatch()
    watch.update(world(100, { red: 'stone' }))
    expect(watch.update(world(110, { red: 'bronze' }))).toHaveLength(1)
    expect(watch.update(world(111, { red: 'bronze' }))).toEqual([])
    expect(watch.update(world(112, { red: 'bronze' }))).toEqual([])
    expect(watch.active(112)).toHaveLength(1)
  })

  it('forgets everything when the world goes back in time (a reload or a new world)', () => {
    const watch = new EraWatch()
    watch.update(world(5000, { red: 'bronze' }))
    watch.update(world(5100, { red: 'iron' }))
    expect(watch.active(5100)).toHaveLength(1)
    watch.update(world(40, { red: 'pre-stone' }))
    expect(watch.active(40)).toEqual([])
    expect(watch.update(world(60, { red: 'pre-stone' }))).toEqual([])
  })
})
