import { describe, expect, it } from 'vitest'
import {
  LAUNCH_PERIOD,
  LAUNCH_TICKS,
  flightPosition,
  launchProgress,
  padEmpty,
  railLinks,
  trainProgress,
} from './era-traffic'

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

describe('railways', () => {
  const station = (id: number, owner: string, x: number, y: number) => ({
    id,
    kind: 'TrainStation',
    x,
    y,
    fw: 2,
    fh: 2,
    owner,
  })

  it('chains each tribe’s stations nearest-first and skips long gaps', () => {
    const links = railLinks([
      station(1, 'a', 0, 0),
      station(2, 'a', 100, 0),
      station(3, 'a', 40, 0),
      station(4, 'a', 500, 0),
      station(5, 'b', 0, 50),
      { id: 6, kind: 'House', x: 1, y: 1, owner: 'a' },
    ])
    expect(links.map((l) => [l.a.id, l.b.id])).toEqual([
      [1, 3],
      [3, 2],
    ])
  })

  it('shuttles a train between the two ends, pausing at each', () => {
    const [link] = railLinks([station(1, 'a', 0, 0), station(2, 'a', 50, 0)])
    const samples = [...Array(4000).keys()].map((t) => trainProgress(link!, t))
    expect(Math.min(...samples)).toBe(0)
    expect(Math.max(...samples)).toBe(1)
    expect(samples.filter((p) => p === 0).length).toBeGreaterThan(50)
  })
})
