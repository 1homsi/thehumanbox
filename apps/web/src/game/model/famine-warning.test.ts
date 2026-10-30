import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../shared/types'
import {
  enqueueFamine,
  famineStages,
  FAMINE_RISK_FOOD,
  watchFamine,
  type FamineWatch,
  type QueuedFamine,
} from './famine-warning'

const org = (lineage_id: string, energy: number, alive = true) => ({ lineage_id, energy, alive })
// The chronicle's `extinct` kind comes with the tribe-history change; this test only needs the shape.
const row = (tick: number, kind: string, word: string | null = null) =>
  ({ tick, kind, other: null, word, x: null, y: null }) as never

/** A frame with the given tribes: food per living tribe, and the rest as the sim reports them. */
function frame(
  tick: number,
  food: Record<string, number>,
  extra: Partial<Pick<WorldState, 'tribes_in_peril' | 'tribe_losses' | 'tribe_chronicle'>> = {},
) {
  const organisms = Object.entries(food).flatMap(([lid, e]) => [org(lid, e), org(lid, e)])
  return {
    tick,
    organisms,
    tribes_in_peril: [],
    tribe_losses: {},
    tribe_chronicle: {},
    ...extra,
  } as unknown as Parameters<typeof watchFamine>[1]
}

describe('famineStages', () => {
  it('puts a tribe at risk when its average food is low, and leaves a fed tribe out', () => {
    const stages = famineStages(frame(100, { hungry: FAMINE_RISK_FOOD - 0.1, fed: 0.9 }))
    expect(stages.get('hungry')).toBe('risk')
    expect(stages.has('fed')).toBe(false)
  })

  it('puts a tribe losing people when hunger has it on the brink or its losses include starvation', () => {
    const onBrink = famineStages(
      frame(100, { a: 0.8 }, { tribes_in_peril: [{ lineage_id: 'a', cause: 'hunger' }] } as never),
    )
    expect(onBrink.get('a')).toBe('losing')
    const losses = famineStages(frame(100, { b: 0.8 }, { tribe_losses: { b: { starvation: 2 } } }))
    expect(losses.get('b')).toBe('losing')
  })

  it('a tribe on the brink from another cause is not losing people to famine', () => {
    const stages = famineStages(
      frame(100, { a: 0.8 }, { tribes_in_peril: [{ lineage_id: 'a', cause: 'war' }] } as never),
    )
    expect(stages.has('a')).toBe(false)
  })

  it('a tribe whose last member starved is gone; one lost to other causes is not in a famine', () => {
    const stages = famineStages(
      frame(
        100,
        {},
        {
          tribe_chronicle: {
            starved: [row(50, 'extinct', 'starvation')],
            old: [row(60, 'extinct', 'old_age')],
          },
        },
      ),
    )
    expect(stages.get('starved')).toBe('gone')
    expect(stages.has('old')).toBe(false)
  })
})

describe('watchFamine', () => {
  it('learns the state on the first look without warning about what was already true', () => {
    const result = watchFamine(null, frame(100, { hungry: 0.1 }))
    expect(result.warnings).toEqual([])
    expect(result.stages.get('hungry')).toBe('risk')
  })

  it('warns once for each stage a tribe reaches, escalating from risk to losing to gone', () => {
    let watch: FamineWatch | null = watchFamine(null, frame(100, { a: 0.8 })).watch
    const step = (f: ReturnType<typeof frame>) => {
      const r = watchFamine(watch, f)
      watch = r.watch
      return r.warnings
    }
    expect(step(frame(200, { a: 0.1 }))).toEqual([{ lineage: 'a', stage: 'risk' }])
    expect(step(frame(300, { a: 0.1 }))).toEqual([])
    expect(step(frame(400, { a: 0.1 }, { tribe_losses: { a: { starvation: 1 } } }))).toEqual([
      { lineage: 'a', stage: 'losing' },
    ])
    expect(step(frame(500, {}, { tribe_chronicle: { a: [row(500, 'extinct', 'starvation')] } }))).toEqual([
      { lineage: 'a', stage: 'gone' },
    ])
    // Gone stays warned: the next look does not repeat it.
    expect(step(frame(600, {}, { tribe_chronicle: { a: [row(500, 'extinct', 'starvation')] } }))).toEqual([])
  })

  it('a tribe that recovers and falls back into a stage is warned again', () => {
    let watch: FamineWatch | null = watchFamine(null, frame(100, { a: 0.8 })).watch
    watch = watchFamine(watch, frame(200, { a: 0.1 })).watch
    watch = watchFamine(watch, frame(300, { a: 0.9 })).watch
    const again = watchFamine(watch, frame(400, { a: 0.1 }))
    expect(again.warnings).toEqual([{ lineage: 'a', stage: 'risk' }])
  })

  it('a new world (time went back) starts the watch afresh', () => {
    const first = watchFamine(null, frame(900, { a: 0.8 })).watch
    const replaced = watchFamine(first, frame(10, { a: 0.1 }))
    expect(replaced.warnings).toEqual([])
    expect(replaced.watch.worldTick).toBe(10)
  })
})

describe('enqueueFamine', () => {
  const warn = (id: number): QueuedFamine => ({ id, lineage: `t${id}`, stage: 'risk', count: 1 })

  it('queues warnings while there is room', () => {
    expect(enqueueFamine([warn(1)], [warn(2)], 5).map((q) => q.id)).toEqual([1, 2])
  })

  it('folds warnings past the limit into one summary that counts them, keeping the queue at the limit', () => {
    const queue = enqueueFamine([], [1, 2, 3, 4, 5, 6].map(warn), 5)
    expect(queue).toHaveLength(5)
    expect(queue.slice(0, 4).map((q) => q.lineage)).toEqual(['t3', 't4', 't5', 't6'])
    expect(queue[4]).toMatchObject({ lineage: null, count: 2 })
  })

  it('adds to the summary already waiting rather than adding a second one', () => {
    const first = enqueueFamine([], [1, 2, 3, 4, 5, 6].map(warn), 5)
    const second = enqueueFamine(first, [warn(7)], 5)
    expect(second).toHaveLength(5)
    expect(second.filter((q) => q.lineage === null)).toEqual([expect.objectContaining({ count: 3 })])
    expect(second.map((q) => q.lineage).slice(0, 4)).toEqual(['t4', 't5', 't6', 't7'])
  })
})
