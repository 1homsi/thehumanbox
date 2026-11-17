import { describe, expect, it } from 'vitest'
import type { BattleInfo, SimEvent, WorldState } from '../../shared/types'
import { agoOf, eventLine, readsRaw, worldFeed } from './world-feed'
import { tribeMood } from './tribe-mood'

const ev = (tick: number, type: string, actor = 'Ana', detail = 'did a thing'): SimEvent =>
  ({ tick, type, actor, detail, news: true }) as SimEvent

const battle = (a: string, d: string): BattleInfo =>
  ({
    id: `${a}-${d}`,
    attackers: [a],
    defenders: [d],
    location: [10, 20],
    ended: false,
  }) as unknown as BattleInfo

function world(over: Partial<WorldState> = {}): Parameters<typeof worldFeed>[0] {
  return {
    events: [],
    battles: [],
    tribes_in_peril: [],
    tribe_losses: {},
    lineage_sizes: [],
    lineage_names: { a: 'Ama', b: 'Bo', c: 'Ceru' },
    drought: false,
    hard_winter: false,
    hard_winter_ahead: false,
    ...over,
  } as Parameters<typeof worldFeed>[0]
}

describe('the world feed', () => {
  it('leads with what is happening now, then the newest news', () => {
    const items = worldFeed(
      world({
        battles: [battle('a', 'b'), battle('b', 'a')],
        tribes_in_peril: [
          { lineage_id: 'c', tribe: 'Ceru', cause: 'hunger' } as NonNullable<
            WorldState['tribes_in_peril']
          >[number],
        ],
        drought: true,
        events: [ev(1, 'treaty'), ev(2, 'battle'), ev(3, 'treaty', 'Bo')],
      }),
    )
    expect(items.map((i) => i.kind)).toEqual(['peril', 'war', 'season', 'event', 'event'])
    const events = items.filter((i) => i.kind === 'event')
    expect(events.map((i) => (i.kind === 'event' ? i.event.tick : 0))).toEqual([3, 2])
  })

  it('keeps one war per pair of tribes and skips everyday chatter', () => {
    const items = worldFeed(
      world({
        battles: [battle('a', 'b'), battle('b', 'a')],
        events: [{ ...ev(5, 'born'), news: false }, ev(6, 'dawn')],
      }),
    )
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'war', a: 'Ama', b: 'Bo' })
  })

  it('names a tribe that lost people to hunger even before it is on the brink', () => {
    const items = worldFeed(
      world({ tribe_losses: { b: { starvation: 2 } }, lineage_sizes: [{ id: 'b', count: 4 }] }),
    )
    expect(items[0]).toMatchObject({ kind: 'peril', lineage: 'b', cause: 'hunger' })
  })

  it('stops at five', () => {
    const types = ['treaty', 'battle', 'era', 'outbreak', 'drought', 'weather', 'milestone']
    expect(worldFeed(world({ events: types.map((type, i) => ev(i, type)) }))).toHaveLength(5)
  })
})

describe('raw simulation text', () => {
  it('keeps ids and map coordinates out of the feed', () => {
    expect(readsRaw({ actor: '29847bdf', detail: 'workshop at (607,173) was ruined' })).toBe(true)
    expect(readsRaw({ actor: 'Dapi', detail: 'a323 ↔ 563d' })).toBe(true)
    expect(readsRaw({ actor: 'Logur', detail: 'stole 6 from Zofe and faced 1200 days' })).toBe(false)
    expect(worldFeed(world({ events: [ev(1, 'treaty', 'Dapi', 'a323 ↔ 563d')] }))).toEqual([])
  })
})

describe('an event line', () => {
  it('does not repeat the name the detail starts with', () => {
    expect(eventLine({ actor: 'Dosot', detail: 'Dosot entered the bronze era' })).toEqual({
      lead: 'Dosot',
      text: 'entered the bronze era',
    })
  })

  it('leaves the world unnamed', () => {
    expect(eventLine({ actor: 'the world', detail: 'rain begins' })).toEqual({ text: 'rain begins' })
  })
})

describe('how long ago', () => {
  it('reads in days, then years', () => {
    expect(agoOf(1000, 900)).toEqual({ unit: 'now' })
    expect(agoOf(3000, 0)).toEqual({ unit: 'days', count: 5 })
    expect(agoOf(30000, 0)).toEqual({ unit: 'years', count: 2 })
  })
})

describe('a tribe in one word', () => {
  const base = { people: 10, food: 0.7, health: 0.7, sick: 0, atWar: false, trend: 'flat' as const }
  it('puts danger before everything else', () => {
    expect(tribeMood({ ...base, peril: 'hunger' })).toBe('starving')
    expect(tribeMood({ ...base, atWar: true, trend: 'up' })).toBe('war')
    expect(tribeMood({ ...base, peril: 'old_age' })).toBe('dying')
  })
  it('says how everyday life is going', () => {
    expect(tribeMood({ ...base, sick: 3 })).toBe('sick')
    expect(tribeMood({ ...base, food: 0.2 })).toBe('hungry')
    expect(tribeMood({ ...base, trend: 'up' })).toBe('growing')
    expect(tribeMood({ ...base, trend: 'down' })).toBe('shrinking')
    expect(tribeMood(base)).toBe('thriving')
    expect(tribeMood({ ...base, food: 0.5 })).toBe('steady')
  })
})
