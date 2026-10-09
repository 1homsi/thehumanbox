import { describe, expect, it } from 'vitest'
import { rollRandomEvent } from './sandbox'

/** A sequence of rolls; zeros once it runs out. */
function rolls(...values: number[]): () => number {
  let i = 0
  return () => (i < values.length ? values[i++] : 0)
}

describe('the dice tool', () => {
  it('lands a placed event on a spot inside the world', () => {
    // 0.2 of eleven events is the fourth, a blessing; then x = 0.5 of 600 and y = 0.25 of 300.
    expect(rollRandomEvent(600, 300, rolls(0.2, 0.5, 0.25))).toEqual({
      cmd: 'bless',
      x: 300,
      y: 75,
      radius: 6,
    })
  })

  it('picks an event from its table by the first roll', () => {
    expect(rollRandomEvent(600, 300, rolls(0))).toEqual({ cmd: 'weather', kind: 'rain' })
    expect(rollRandomEvent(600, 300, rolls(0.1))).toEqual({ cmd: 'gale' })
    expect(rollRandomEvent(600, 300, rolls(0.4, 0.5, 0.5))).toEqual({
      cmd: 'spawn',
      x: 300,
      y: 150,
      count: 5,
    })
  })

  it('only ever rolls commands the simulation knows, on the map', () => {
    const known = new Set([
      'weather',
      'gale',
      'bless',
      'harvest',
      'spawn',
      'spawn_animal',
      'meteor',
      'tornado',
      'wildfire',
      'earthquake',
      'locusts',
    ])
    for (let i = 0; i < 300; i++) {
      const cmd = rollRandomEvent(600, 300)
      expect(known.has(cmd.cmd), cmd.cmd).toBe(true)
      if ('x' in cmd) {
        expect(cmd.x).toBeGreaterThanOrEqual(0)
        expect(cmd.x).toBeLessThan(600)
        expect(cmd.y).toBeGreaterThanOrEqual(0)
        expect(cmd.y).toBeLessThan(300)
      }
    }
  })
})
