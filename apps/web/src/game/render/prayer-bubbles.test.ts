import { describe, expect, it } from 'vitest'
import { mergedPrayerBubbles, prayerAtPoint, prayerBubbleScale } from './prayer-bubbles'

describe('prayer bubble hit-testing', () => {
  const prayers = [
    { id: 1, x: 10, y: 10 },
    { id: 2, x: 40, y: 10 },
  ]
  const origin = { x: 0, y: 0 }

  it('finds the bubble above a praying tribe', () => {
    // Tile (10,10) anchors at (84, 72); the bubble sits above that.
    expect(prayerAtPoint(prayers, 84, 62, origin, 8, 2, () => 1)?.id).toBe(1)
    expect(prayerAtPoint(prayers, 324, 62, origin, 8, 2, () => 1)?.id).toBe(2)
  })

  it('misses empty ground and the tile below the bubble', () => {
    expect(prayerAtPoint(prayers, 200, 62, origin, 8, 2, () => 1)).toBeNull()
    expect(prayerAtPoint(prayers, 84, 90, origin, 8, 2, () => 1)).toBeNull()
  })

  it('grows the hit box with the bubble when zoomed out', () => {
    expect(prayerBubbleScale(0.4)).toBe(4)
    expect(prayerAtPoint(prayers, 84, 0, origin, 8, 0.4, () => 1)?.id).toBe(1)
    expect(prayerAtPoint(prayers, 84, 0, origin, 8, 2, () => 1)).toBeNull()
  })
})

describe('merged prayer bubbles', () => {
  // Two prayers one tile apart merge into one drawn bubble, carried by the more urgent prayer.
  const prayers = [
    { id: 1, x: 10, y: 10, left: 0.2 },
    { id: 2, x: 11, y: 10, left: 0.9 },
  ]
  const origin = { x: 0, y: 0 }
  const timeLeft = (p: { left: number }) => p.left

  it('draws one bubble for the group, anchored on its most urgent prayer', () => {
    const drawn = mergedPrayerBubbles(prayers, timeLeft, origin, 8, 2)
    expect(drawn).toHaveLength(1)
    expect(drawn[0]!.prayer.id).toBe(1)
    expect(drawn[0]!.count).toBe(2)
  })

  it('answers a click or hover on either side of the group with the prayer the glyph shows', () => {
    // (92, 64) is above the quieter prayer's own anchor (92, 72); it still answers as prayer 1, the glyph drawn.
    expect(prayerAtPoint(prayers, 92, 64, origin, 8, 2, timeLeft)?.id).toBe(1)
    expect(prayerAtPoint(prayers, 84, 64, origin, 8, 2, timeLeft)?.id).toBe(1)
  })
})
