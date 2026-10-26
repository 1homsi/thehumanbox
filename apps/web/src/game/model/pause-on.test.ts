import { describe, expect, it } from 'vitest'
import type { SimEvent, TribePeril } from '../../shared/types'
import { watchChanges, type ChangeWatch, type WatchedWorld } from './pause-on'

const event = (tick: number, type: string, actor = 'Ash'): SimEvent =>
  ({ tick, type, actor, detail: '' }) as unknown as SimEvent

const peril = (id: string, cause = 'dwindling'): TribePeril =>
  ({
    lineage_id: id,
    tribe: `tribe ${id}`,
    population: 2,
    peak: 20,
    cause,
    since: 0,
  }) as TribePeril

function world(over: Partial<WatchedWorld> = {}): WatchedWorld {
  return {
    tick: 100,
    events: [],
    tribes_in_peril: [],
    lineage_sizes: [
      { id: 'a', count: 5 },
      { id: 'b', count: 4 },
    ],
    lineage_names: { a: 'Ash', b: 'Birch' },
    ...over,
  } as WatchedWorld
}

/** Look once to learn the state, then return the look function for the next frames. */
function start(w: WatchedWorld): ChangeWatch {
  const first = watchChanges(null, w)
  expect(first.hits).toEqual([])
  return first.watch
}

describe('watchChanges', () => {
  it('learns what is already true on the first look and reports nothing for it', () => {
    const w = world({
      events: [event(40, 'era_advance'), event(60, 'war_declared')],
      tribes_in_peril: [peril('a', 'hunger')],
    })
    const first = watchChanges(null, w)
    expect(first.hits).toEqual([])
    expect(first.watch.tick).toBe(60)
    expect([...first.watch.perils]).toEqual(['a'])
    expect([...first.watch.tribes].sort()).toEqual(['a', 'b'])
  })

  it('reports a new era and a new war with the tribe that made them', () => {
    const w0 = world({ tick: 100 })
    const watch = start(w0)
    const next = world({
      tick: 400,
      events: [
        event(150, 'era_advance', 'Ash'),
        event(200, 'era', 'world'),
        event(300, 'battle_began', 'Birch'),
      ],
    })
    const { hits } = watchChanges(watch, next)
    expect(hits).toEqual([
      { trigger: 'era', names: ['Ash'] },
      { trigger: 'era', names: [] },
      { trigger: 'war', names: ['Birch'] },
    ])
  })

  it('does not report the same event twice', () => {
    const watch = start(world({ tick: 100 }))
    const once = watchChanges(watch, world({ tick: 200, events: [event(150, 'war_declared')] }))
    expect(once.hits).toHaveLength(1)
    const again = watchChanges(once.watch, world({ tick: 300, events: [event(150, 'war_declared')] }))
    expect(again.hits).toEqual([])
  })

  it('ignores event kinds that are not a watched change', () => {
    const watch = start(world({ tick: 100 }))
    const { hits } = watchChanges(
      watch,
      world({ tick: 200, events: [event(150, 'born'), event(160, 'weather')] }),
    )
    expect(hits).toEqual([])
  })

  it('reports a tribe newly on the brink, and a hunger brink as a famine too', () => {
    const watch = start(world({ tick: 100 }))
    const { hits } = watchChanges(
      watch,
      world({ tick: 300, tribes_in_peril: [peril('a', 'hunger'), peril('b', 'war')] }),
    )
    expect(hits).toEqual([
      { trigger: 'brink', names: ['tribe a'] },
      { trigger: 'famine', names: ['tribe a'] },
      { trigger: 'brink', names: ['tribe b'] },
    ])
  })

  it('reports a tribe that was on the brink and stays there only once', () => {
    const start1 = start(world({ tick: 100, tribes_in_peril: [peril('a')] }))
    const later = watchChanges(start1, world({ tick: 400, tribes_in_peril: [peril('a')] }))
    expect(later.hits).toEqual([])
  })

  it('reports a tribe that dies out, by name, once', () => {
    const watch = start(world({ tick: 100 }))
    const gone = watchChanges(watch, world({ tick: 400, lineage_sizes: [{ id: 'a', count: 5 }] }))
    expect(gone.hits).toEqual([{ trigger: 'extinct', names: ['Birch'] }])
    expect(
      watchChanges(gone.watch, world({ tick: 700, lineage_sizes: [{ id: 'a', count: 5 }] })).hits,
    ).toEqual([])
  })

  it('reports a famine once when a tribe already on the brink turns to hunger', () => {
    const watch = start(world({ tick: 100, tribes_in_peril: [peril('a', 'dwindling')] }))
    const turned = watchChanges(watch, world({ tick: 200, tribes_in_peril: [peril('a', 'hunger')] }))
    expect(turned.hits).toEqual([{ trigger: 'famine', names: ['tribe a'] }])
    const again = watchChanges(turned.watch, world({ tick: 300, tribes_in_peril: [peril('a', 'hunger')] }))
    expect(again.hits).toEqual([])
  })

  it('starts over when a replacement world has an earlier tick, even with events later than the last ones seen', () => {
    const watch = start(world({ tick: 1000, events: [event(900, 'born')] }))
    const { hits, watch: next } = watchChanges(
      watch,
      world({ tick: 950, events: [event(920, 'war_declared')] }),
    )
    expect(hits).toEqual([])
    expect(next.worldTick).toBe(950)
    expect(next.tick).toBe(920)
  })

  it('keeps the tribes it knew when a frame has no lineage list', () => {
    const watch = start(world({ tick: 100 }))
    const partial = watchChanges(watch, world({ tick: 200, lineage_sizes: undefined }))
    expect(partial.hits).toEqual([])
    const gone = watchChanges(partial.watch, world({ tick: 300, lineage_sizes: [{ id: 'a', count: 5 }] }))
    expect(gone.hits).toEqual([{ trigger: 'extinct', names: ['Birch'] }])
  })

  it('starts over when the world goes back in time, without pausing for its old events', () => {
    const watch = start(world({ tick: 100, events: [event(50, 'born')] }))
    const { hits, watch: next } = watchChanges(
      watch,
      world({ tick: 5, events: [event(3, 'war_declared')], tribes_in_peril: [] }),
    )
    expect(hits).toEqual([])
    expect(next.tick).toBe(3)
  })
})
