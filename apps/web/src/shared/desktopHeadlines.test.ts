import { describe, expect, it } from 'vitest'
import { pickNewHeadline } from './desktopHeadlines'

const saved = [
  { tick: 40_000, text: 'Last year of the old chronicle' },
  { tick: 39_000, text: 'Earlier chronicle' },
]

describe('desktop headline notices', () => {
  it('does not announce the saved chronicle on the first world', () => {
    const first = pickNewHeadline(null, saved)
    expect(first).toEqual({ seenTick: 40_000, headline: null })
  })

  it('announces only a headline newer than the first world', () => {
    const first = pickNewHeadline(null, saved)
    const same = pickNewHeadline(first.seenTick, saved)
    expect(same.headline).toBeNull()

    const later = { tick: 40_010, text: 'A new headline' }
    const next = pickNewHeadline(first.seenTick, [later, ...saved])
    expect(next).toEqual({ seenTick: 40_010, headline: later })
    expect(pickNewHeadline(next.seenTick, [later, ...saved]).headline).toBeNull()
  })

  it('treats the first headline of a world that started empty as news', () => {
    const first = pickNewHeadline(null, [])
    const later = { tick: 5, text: 'The first headline ever' }
    expect(pickNewHeadline(first.seenTick, [later]).headline).toEqual(later)
  })

  it('ignores a world without headlines or with a malformed newest headline', () => {
    expect(pickNewHeadline(40_000, undefined)).toEqual({ seenTick: 40_000, headline: null })
    const malformed = [{ tick: Number.NaN, text: 'x' }]
    expect(pickNewHeadline(40_000, malformed).headline).toBeNull()
  })

  it('does not seed a first world whose newest headline is malformed', () => {
    const malformed = [{ tick: Number.NaN, text: 'x' }]
    const first = pickNewHeadline(null, malformed)
    expect(first).toEqual({ seenTick: null, headline: null })
    expect(pickNewHeadline(first.seenTick, saved)).toEqual({ seenTick: 40_000, headline: null })
  })
})
