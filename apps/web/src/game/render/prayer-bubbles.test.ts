import { describe, expect, it } from 'vitest'
import { prayerAtPoint, prayerBubbleScale } from './prayer-bubbles'

describe('prayer bubble hit-testing', () => {
  const prayers = [
    { id: 1, x: 10, y: 10 },
    { id: 2, x: 40, y: 10 },
  ]
  const origin = { x: 0, y: 0 }

  it('finds the bubble above a praying tribe', () => {
    // Tile (10,10) anchors at (84, 72); the bubble sits above that.
    expect(prayerAtPoint(prayers, 84, 62, origin, 8, 2)?.id).toBe(1)
    expect(prayerAtPoint(prayers, 324, 62, origin, 8, 2)?.id).toBe(2)
  })

  it('misses empty ground and the tile below the bubble', () => {
    expect(prayerAtPoint(prayers, 200, 62, origin, 8, 2)).toBeNull()
    expect(prayerAtPoint(prayers, 84, 90, origin, 8, 2)).toBeNull()
  })

  it('grows the hit box with the bubble when zoomed out', () => {
    expect(prayerBubbleScale(0.4)).toBe(4)
    expect(prayerAtPoint(prayers, 84, 0, origin, 8, 0.4)?.id).toBe(1)
    expect(prayerAtPoint(prayers, 84, 0, origin, 8, 2)).toBeNull()
  })
})
