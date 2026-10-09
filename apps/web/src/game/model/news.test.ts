import { describe, expect, it } from 'vitest'
import { isNewsEvent } from './news'

describe('news', () => {
  it("trusts the sim's flag", () => {
    expect(isNewsEvent({ type: 'life', news: true })).toBe(true)
    expect(isNewsEvent({ type: 'prayer', news: false })).toBe(false)
  })

  it('falls back to the news kinds for older snapshots', () => {
    expect(isNewsEvent({ type: 'prayer' })).toBe(true)
    expect(isNewsEvent({ type: 'era_advance' })).toBe(true)
  })

  it('shows the first caravan between two tribes, and not every load', () => {
    expect(isNewsEvent({ type: 'trade_route' })).toBe(true)
    expect(isNewsEvent({ type: 'trade' })).toBe(false)
  })

  it('keeps everyday deaths and scuffles out of the important view', () => {
    for (const type of ['died', 'challenge', 'gift', 'born', 'strategy_complete']) {
      expect(isNewsEvent({ type })).toBe(false)
    }
  })
})
