import type { WorldState } from '../../shared/types'

/**
 * Ticks two tribes' words must stay apart before the split counts. A tribe's word is the most common
 * one among its living members, so it can flicker for a moment as people come and go.
 */
export const SPLIT_CONFIRM_TICKS = 600

/** Two tribes that used to say the same word for a thing, and now say different words. */
export interface WordSplit {
  /** Lineage ids, in sorted order. */
  first: string
  second: string
  /** The thing both words name (a concept key such as `water`). */
  concept: string
  firstWord: string
  secondWord: string
  tick: number
}

type LineageWords = Record<string, Record<string, string>>

/**
 * Notices the first time two tribes that shared a word for a thing stop sharing it. Reads the
 * tribes' words from each full frame (`lineage_words`). A pair that already differs when the watch
 * first looks is not a split, since nothing was seen to share. A world that starts over (its tick
 * goes back) starts the watch again.
 */
export class WordSplitWatch {
  private shared = new Set<string>()
  /** Pairs that differ now, keyed by the tick they were first seen apart. */
  private apartSince = new Map<string, number>()
  private lastTick = -Infinity
  private reported = false

  /** Reads one frame; returns the split found in it, at most once per world. */
  update(world: Pick<WorldState, 'lineage_words' | 'tick'>): WordSplit | null {
    if (world.tick < this.lastTick) this.reset()
    this.lastTick = world.tick
    const words = world.lineage_words as LineageWords | undefined
    if (this.reported || !words) return null
    const lineages = Object.keys(words).sort()
    for (let i = 0; i < lineages.length; i++) {
      for (let j = i + 1; j < lineages.length; j++) {
        const a = lineages[i]!
        const b = lineages[j]!
        const wordsA = words[a] ?? {}
        const wordsB = words[b] ?? {}
        const concepts = new Set([...Object.keys(wordsA), ...Object.keys(wordsB)])
        for (const concept of concepts) {
          const wa = wordsA[concept]
          const wb = wordsB[concept]
          const key = `${a}\u0000${b}\u0000${concept}`
          // A frame that leaves one word out says nothing about the pair, so the apart-clock stops rather than
          // counting the missing ticks.
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

  private reset() {
    this.shared.clear()
    this.apartSince.clear()
    this.reported = false
  }
}
