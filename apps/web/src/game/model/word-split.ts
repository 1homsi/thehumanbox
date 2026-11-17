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
  private lastWords = new Map<string, Map<string, string>>()
  private apart = new Map<string, Map<string, { first: string; second: string; since: number | null }>>()
  private lastTick = -Infinity
  private reported = false

  /** Reads one frame; returns the split found in it, at most once per world. */
  update(world: Pick<WorldState, 'lineage_words' | 'tick'>): WordSplit | null {
    if (world.tick < this.lastTick) this.reset()
    this.lastTick = world.tick
    const words = world.lineage_words as LineageWords | undefined
    if (this.reported || !words) return null
    const lineages = Object.keys(words).sort()
    const concepts = new Set<string>()
    for (const lineage of lineages)
      for (const concept of Object.keys(words[lineage] ?? {})) concepts.add(concept)
    for (const concept of this.apart.keys()) concepts.add(concept)
    let found: WordSplit | null = null
    for (const concept of concepts) {
      const split = this.updateConcept(concept, lineages, words, world.tick)
      if (split && (!found || splitOrder(split, found) < 0)) found = split
    }
    if (found) this.reported = true
    return found
  }

  private updateConcept(
    concept: string,
    lineages: string[],
    words: LineageWords,
    tick: number,
  ): WordSplit | null {
    let last = this.lastWords.get(concept)
    if (!last) {
      last = new Map()
      this.lastWords.set(concept, last)
    }
    let apart = this.apart.get(concept)
    const sayingBefore = new Map<string, string[]>()
    for (const [lineage, word] of last) {
      const list = sayingBefore.get(word)
      if (list) list.push(lineage)
      else sayingBefore.set(word, [lineage])
    }
    for (const lineage of lineages) {
      const word = words[lineage]?.[concept]
      if (!word) continue
      const before = last.get(lineage)
      if (before !== undefined && before !== word) {
        for (const other of sayingBefore.get(before) ?? []) {
          if (other === lineage) continue
          const [first, second] = lineage < other ? [lineage, other] : [other, lineage]
          const key = `${first}\u0000${second}`
          apart ??= new Map()
          if (!apart.has(key)) apart.set(key, { first, second, since: null })
        }
      }
      last.set(lineage, word)
    }
    if (!apart) return null
    this.apart.set(concept, apart)
    let found: WordSplit | null = null
    for (const [key, pair] of apart) {
      const firstWord = words[pair.first]?.[concept]
      const secondWord = words[pair.second]?.[concept]
      if (!firstWord || !secondWord) {
        pair.since = null
        continue
      }
      if (firstWord === secondWord) {
        apart.delete(key)
        continue
      }
      if (pair.since === null) {
        pair.since = tick
        continue
      }
      if (tick - pair.since < SPLIT_CONFIRM_TICKS) continue
      const split = { first: pair.first, second: pair.second, concept, firstWord, secondWord, tick }
      if (!found || splitOrder(split, found) < 0) found = split
    }
    return found
  }

  private reset() {
    this.lastWords.clear()
    this.apart.clear()
    this.reported = false
  }
}

function splitOrder(a: WordSplit, b: WordSplit): number {
  if (a.first !== b.first) return a.first < b.first ? -1 : 1
  if (a.second !== b.second) return a.second < b.second ? -1 : 1
  return 0
}
