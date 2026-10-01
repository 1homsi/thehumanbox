import { describe, expect, it } from 'vitest'
import { emoteFor } from './activity-emotes'

describe('activity emotes', () => {
  it('reads what people are doing from their thoughts', () => {
    expect(emoteFor({ thought: 'fought off a wolf' })).toBe('fight')
    expect(emoteFor({ thought: 'walking with partner' })).toBe('love')
    expect(emoteFor({ thought: 'praying at the shrine' })).toBe('pray')
    expect(emoteFor({ thought: 'trading goods' })).toBe('trade')
    expect(emoteFor({ thought: 'inspired: printing' })).toBe('idea')
  })

  it('falls back to strong feelings, and stays quiet otherwise', () => {
    expect(emoteFor({ thought: 'wandering', fear_level: 0.9 })).toBe('fear')
    expect(emoteFor({ thought: 'wandering', infection: 0.6 })).toBe('sick')
    expect(emoteFor({ thought: 'wandering', joy_ticks: 900 })).toBe('joy')
    expect(emoteFor({ thought: 'wandering' })).toBeNull()
    expect(emoteFor({})).toBeNull()
  })
})
