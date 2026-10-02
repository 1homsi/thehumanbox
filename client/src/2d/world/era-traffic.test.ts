import { describe, expect, it } from 'vitest'
import { LAUNCH_PERIOD, LAUNCH_TICKS, flightPosition, launchProgress, padEmpty } from './era-traffic'

describe('era traffic', () => {
  it('launches each spaceport once a period, and leaves the pad empty a while after', () => {
    let launching = 0
    let empty = 0
    for (let tick = 0; tick < LAUNCH_PERIOD; tick++) {
      if (launchProgress(7, tick) !== null) launching++
      if (padEmpty(7, tick)) empty++
    }
    expect(launching).toBe(LAUNCH_TICKS)
    expect(empty).toBeGreaterThan(LAUNCH_TICKS)
    expect(empty).toBeLessThan(LAUNCH_PERIOD)
  })

  it('staggers neighbouring spaceports', () => {
    const at = (id: number) => [...Array(LAUNCH_PERIOD).keys()].find((t) => launchProgress(id, t) === 0)
    expect(at(1)).not.toBe(at(2))
  })

  it('flies a tribe’s plane through its main settlement', () => {
    const centre = { x: 300, y: 150 }
    const positions = [...Array(3000).keys()]
      .map((t) => flightPosition('lineage-a', centre, t))
      .filter((p): p is NonNullable<typeof p> => p !== null)
    expect(positions.length).toBeGreaterThan(0)
    const closest = Math.min(...positions.map((p) => Math.hypot(p.x - centre.x, p.y - centre.y)))
    expect(closest).toBeLessThan(2)
  })
})
