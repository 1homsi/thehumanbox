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
