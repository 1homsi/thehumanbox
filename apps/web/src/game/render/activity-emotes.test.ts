import { describe, expect, it } from 'vitest'
import { drawEmote, EMOTES, emoteFor } from './activity-emotes'

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
    // A settled good mood is how most people are; it does not put an emote over them.
    expect(emoteFor({ thought: 'wandering', joy_ticks: 900 } as never)).toBeNull()
    expect(emoteFor({ thought: 'wandering' })).toBeNull()
    expect(emoteFor({})).toBeNull()
  })

  it('draws each emote as an outlined icon, with no box behind it', () => {
    for (const emote of EMOTES) {
      const fills: Record<string, Set<string>> = {}
      let style = ''
      const ctx = {
        set fillStyle(v: string) {
          style = v
        },
        get fillStyle() {
          return style
        },
        fillRect: (x: number, y: number, w: number, h: number) => {
          // Whole pixels only, one at a time.
          expect([w, h]).toEqual([1, 1])
          ;(fills[style] ??= new Set()).add(`${x},${y}`)
        },
      } as unknown as CanvasRenderingContext2D
      drawEmote(ctx, emote, 50, 40, 0, 0)
      const ink = fills['#2b2117']
      expect(ink?.size, emote).toBeGreaterThan(0)
      const icon = Object.entries(fills).filter(([c]) => c !== '#2b2117')
      expect(icon.length, emote).toBeGreaterThan(0)
      // No pixel is both ink and icon, and every icon pixel touches the ink or another icon pixel.
      const all = new Set<string>()
      for (const [, set] of icon) for (const p of set) all.add(p)
      for (const p of all) expect(ink.has(p), `${emote} ${p}`).toBe(false)
      // The whole emote sits within 9×9 above (50, 40): an icon a person's size at most, not a bubble.
      const xs = [...all, ...ink].map((p) => Number(p.split(',')[0]))
      const ys = [...all, ...ink].map((p) => Number(p.split(',')[1]))
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(8)
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(8)
      expect(Math.max(...ys)).toBeLessThanOrEqual(40)
    }
  })
})
