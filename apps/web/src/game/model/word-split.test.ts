import { describe, expect, it } from 'vitest'
import { SPLIT_CONFIRM_TICKS, WordSplitWatch } from './word-split'

type Words = Record<string, Record<string, string>>

function frame(tick: number, words: Words) {
  return { tick, lineage_words: words }
}

describe('WordSplitWatch', () => {
  it('reports the first time two tribes that shared a word stop sharing it', () => {
    const watch = new WordSplitWatch()
    expect(watch.update(frame(1000, { La: { water: 'pi' }, Lb: { water: 'pi' } }))).toBeNull()
    expect(watch.update(frame(1500, { La: { water: 'ka' }, Lb: { water: 'pi' } }))).toBeNull()
    const split = watch.update(
      frame(1500 + SPLIT_CONFIRM_TICKS, { La: { water: 'ka' }, Lb: { water: 'pi' } }),
    )
    expect(split).toEqual({
      first: 'La',
      second: 'Lb',
      concept: 'water',
      firstWord: 'ka',
      secondWord: 'pi',
      tick: 1500 + SPLIT_CONFIRM_TICKS,
    })
  })

  it('does not report pairs that were already apart when first seen', () => {
    const watch = new WordSplitWatch()
    watch.update(frame(1000, { La: { water: 'pi' }, Lb: { water: 'ka' } }))
    expect(watch.update(frame(5000, { La: { water: 'pi' }, Lb: { water: 'ta' } }))).toBeNull()
    expect(watch.update(frame(9000, { La: { water: 'pi' }, Lb: { water: 'to' } }))).toBeNull()
  })

  it('ignores a word that flickers for less than the confirm window and comes back', () => {
    const watch = new WordSplitWatch()
    watch.update(frame(1000, { La: { fire: 'tek' }, Lb: { fire: 'tek' } }))
    expect(watch.update(frame(1300, { La: { fire: 'ulo' }, Lb: { fire: 'tek' } }))).toBeNull()
    expect(watch.update(frame(1400, { La: { fire: 'tek' }, Lb: { fire: 'tek' } }))).toBeNull()
    // Apart again, but the clock starts over, so it is not yet a split.
    expect(watch.update(frame(1500, { La: { fire: 'ulo' }, Lb: { fire: 'tek' } }))).toBeNull()
    expect(
      watch.update(frame(1500 + SPLIT_CONFIRM_TICKS - 1, { La: { fire: 'ulo' }, Lb: { fire: 'tek' } })),
    ).toBeNull()
  })

  it('reports only the first split in a world', () => {
    const watch = new WordSplitWatch()
    const shared: Words = { La: { water: 'pi', fire: 'tek' }, Lb: { water: 'pi', fire: 'tek' } }
    watch.update(frame(1000, shared))
    const apart: Words = { La: { water: 'ka', fire: 'ulo' }, Lb: { water: 'pi', fire: 'tek' } }
    watch.update(frame(2000, apart))
    expect(watch.update(frame(2000 + SPLIT_CONFIRM_TICKS, apart))).not.toBeNull()
    expect(watch.update(frame(3 * SPLIT_CONFIRM_TICKS + 2000, apart))).toBeNull()
  })

  it('starts the confirm clock again after a frame that leaves one tribe its word out', () => {
    const watch = new WordSplitWatch()
    const shared: Words = { La: { water: 'pi' }, Lb: { water: 'pi' } }
    const apart: Words = { La: { water: 'ka' }, Lb: { water: 'pi' } }
    watch.update(frame(1000, shared))
    expect(watch.update(frame(1100, apart))).toBeNull()
    // Lb's word is missing for a while: that time does not count towards the split.
    expect(watch.update(frame(1300, { La: { water: 'ka' }, Lb: {} }))).toBeNull()
    expect(watch.update(frame(1400, apart))).toBeNull()
    expect(watch.update(frame(1400 + SPLIT_CONFIRM_TICKS - 1, apart))).toBeNull()
    expect(watch.update(frame(1400 + SPLIT_CONFIRM_TICKS, apart))).not.toBeNull()
  })

  it('starts again when the world goes back in time (a new world)', () => {
    const watch = new WordSplitWatch()
    const shared: Words = { La: { water: 'pi' }, Lb: { water: 'pi' } }
    const apart: Words = { La: { water: 'ka' }, Lb: { water: 'pi' } }
    watch.update(frame(5000, shared))
    watch.update(frame(9000, apart))
    expect(watch.update(frame(9000 + SPLIT_CONFIRM_TICKS, apart))).not.toBeNull()
    // A fresh world: the same pair is shared at the start, then splits, and is reported again.
    expect(watch.update(frame(10, shared))).toBeNull()
    watch.update(frame(20, apart))
    expect(watch.update(frame(20 + SPLIT_CONFIRM_TICKS, apart))).not.toBeNull()
  })

  it('does nothing without words, and skips a concept one tribe does not know', () => {
    const watch = new WordSplitWatch()
    expect(watch.update({ tick: 1000 })).toBeNull()
    watch.update(frame(1000, { La: { water: 'pi' }, Lb: { water: 'pi', fire: 'tek' } }))
    expect(watch.update(frame(2000, { La: { water: 'pi' }, Lb: { water: 'pi', fire: 'tek' } }))).toBeNull()
    expect(watch.update(frame(3000, { La: { water: 'pi' }, Lb: { water: 'pi' } }))).toBeNull()
  })
})

class PairwiseWatch {
  private shared = new Set<string>()
  private apartSince = new Map<string, number>()
  private reported = false

  update(world: { tick: number; lineage_words: Words }) {
    if (this.reported) return null
    const words = world.lineage_words
    const lineages = Object.keys(words).sort()
    for (let i = 0; i < lineages.length; i++) {
      for (let j = i + 1; j < lineages.length; j++) {
        const a = lineages[i]!
        const b = lineages[j]!
        const wordsA = words[a] ?? {}
        const wordsB = words[b] ?? {}
        for (const concept of new Set([...Object.keys(wordsA), ...Object.keys(wordsB)])) {
          const wa = wordsA[concept]
          const wb = wordsB[concept]
          const key = `${a}|${b}|${concept}`
          if (!wa || !wb) {
            this.apartSince.delete(key)
            continue
          }
          if (wa === wb) {
            this.shared.add(key)
            this.apartSince.delete(key)
            continue
          }
          if (!this.shared.has(key)) continue
          const since = this.apartSince.get(key)
          if (since === undefined) {
            this.apartSince.set(key, world.tick)
            continue
          }
          if (world.tick - since >= SPLIT_CONFIRM_TICKS) {
            this.reported = true
            return { first: a, second: b, concept, firstWord: wa, secondWord: wb, tick: world.tick }
          }
        }
      }
    }
    return null
  }
}

function random(seed: number) {
  let state = seed
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

describe('WordSplitWatch at scale', () => {
  it('finds the same first split as comparing every pair of tribes, when every tribe names every thing', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const next = random(seed)
      const lineages = Array.from({ length: 6 }, (_, i) => `L${i}`)
      const concepts = ['water', 'fire', 'food']
      const syllables = ['pi', 'ka', 'tu']
      const fast = new WordSplitWatch()
      const slow = new PairwiseWatch()
      let current: Words = {}
      for (let step = 0; step < 30; step++) {
        const words: Words = {}
        for (const lineage of lineages) {
          words[lineage] = {}
          for (const concept of concepts) {
            const keep = current[lineage]?.[concept]
            const roll = next()
            words[lineage]![concept] =
              keep && roll < 0.85 ? keep : syllables[Math.floor(next() * syllables.length)]!
          }
        }
        current = words
        const tick = 1000 + step * 300
        const expected = slow.update({ tick, lineage_words: words })
        const actual = fast.update({ tick, lineage_words: words })
        const pick = (s: { first: string; second: string; tick: number } | null) =>
          s === null ? null : { first: s.first, second: s.second, tick: s.tick }
        expect(pick(actual)).toEqual(pick(expected))
        if (expected) break
      }
    }
  })

  it('reads a frame of 700 tribes that mostly share their words in well under a second', () => {
    const concepts = Array.from({ length: 30 }, (_, i) => `c${i}`)
    const make = (changed: number): Words =>
      Object.fromEntries(
        Array.from({ length: 700 }, (_, i) => [
          `L${String(i).padStart(3, '0')}`,
          Object.fromEntries(concepts.map((c) => [c, i < changed ? 'new' : 'old'])),
        ]),
      )
    const watch = new WordSplitWatch()
    const started = performance.now()
    watch.update(frame(1000, make(0)))
    watch.update(frame(1300, make(5)))
    watch.update(frame(1600, make(5)))
    expect(performance.now() - started).toBeLessThan(1_000)
    expect(watch.update(frame(1300 + SPLIT_CONFIRM_TICKS, make(5)))).toMatchObject({ first: 'L000' })
  })
})
