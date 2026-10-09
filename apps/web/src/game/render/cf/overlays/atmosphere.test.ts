// @vitest-environment happy-dom
import { SpriteLayer } from 'xipjs'
import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../../../shared/types'
import { atmosphereTints, hardWinter, precipitating, writePrecipitation } from './atmosphere'

type W = Parameters<typeof atmosphereTints>[0]

function world(over: Partial<W> = {}): W {
  return {
    season: 'abundance',
    season_progress: 0.5,
    day_progress: 0.35,
    is_day: true,
    hard_winter: false,
    drought: false,
    weather: { kind: 'clear', intensity: 0 },
    ...over,
  } as W
}

describe('atmosphere tints', () => {
  it('lays nothing over a clear midday in the growing season', () => {
    expect(atmosphereTints(world(), 0)).toEqual([])
  })

  it('goes blue at night and warm at dusk and dawn', () => {
    const night = atmosphereTints(world({ is_day: false, day_progress: 0.85 }), 0)
    expect(night).toHaveLength(2)
    expect(night[0].b).toBeGreaterThan(night[0].r)
    const dusk = atmosphereTints(world({ day_progress: 0.7 }), 0)
    expect(dusk[0].r).toBeGreaterThan(dusk[0].b)
    const dawn = atmosphereTints(world({ day_progress: 0.02 }), 0)
    expect(dawn[0].a).toBeGreaterThan(0.1)
  })

  it('tints by season, weather, hard winter and drought, in the painter order', () => {
    const all = atmosphereTints(
      world({
        season: 'scarcity',
        hard_winter: true,
        drought: true,
        weather: { kind: 'storm', intensity: 1 },
        day_progress: 0.7,
      }),
      Math.PI * 500,
    )
    // season, dusk x2, hard winter, storm, drought
    expect(all.map((t) => Math.round(t.a * 100))).toEqual([11, 15, 5, 9, 16, 4])
  })

  it('knows when anything falls from the sky', () => {
    expect(precipitating(world())).toBe(false)
    expect(precipitating(world({ weather: { kind: 'rain', intensity: 1 } }))).toBe(true)
    expect(precipitating(world({ season: 'scarcity', hard_winter: true }))).toBe(true)
    expect(hardWinter(world({ season: 'abundance', hard_winter: true }))).toBe(false)
  })
})

describe('precipitation', () => {
  const Wpx = 4800
  const Hpx = 2400

  it('writes rain streaks that are slanted, translucent and inside the world', () => {
    const layer = new SpriteLayer()
    const w = world({ weather: { kind: 'rain', intensity: 1, wind_x: 0.5, wind_y: 0 } })
    writePrecipitation(layer, 7, w as unknown as WorldState, 123456, Wpx, Hpx)
    expect(layer.count).toBe(50)
    for (let i = 0; i < layer.count; i++) {
      expect(layer.x[i]).toBeGreaterThan(-20)
      expect(layer.x[i]).toBeLessThan(Wpx + 20)
      expect(layer.y[i]).toBeGreaterThanOrEqual(0)
      expect(layer.y[i]).toBeLessThan(Hpx + 20)
      expect(layer.rotation[i]).toBeGreaterThan(0.5)
      expect(layer.frame[i]).toBe(7)
    }
  })

  it('is a pure function of the clock, so a repaint at the same time is identical', () => {
    const a = new SpriteLayer()
    const b = new SpriteLayer()
    const w = world({ weather: { kind: 'storm', intensity: 0.5 } })
    writePrecipitation(a, 0, w as unknown as WorldState, 99999, Wpx, Hpx)
    writePrecipitation(b, 0, w as unknown as WorldState, 99999, Wpx, Hpx)
    expect(Array.from(a.x.subarray(0, a.count))).toEqual(Array.from(b.x.subarray(0, b.count)))
    writePrecipitation(b, 0, w as unknown as WorldState, 100500, Wpx, Hpx)
    expect(Array.from(a.y.subarray(0, a.count))).not.toEqual(Array.from(b.y.subarray(0, b.count)))
  })

  it('snows in a scarcity-season rain and keeps snowing through a hard winter', () => {
    const snow = new SpriteLayer()
    writePrecipitation(
      snow,
      0,
      world({ season: 'scarcity', weather: { kind: 'rain', intensity: 1 } }) as unknown as WorldState,
      1,
      Wpx,
      Hpx,
    )
    expect(snow.count).toBe(90)
    expect(snow.rotation[0]).toBe(0)
    const winter = new SpriteLayer()
    writePrecipitation(
      winter,
      0,
      world({ season: 'scarcity', hard_winter: true }) as unknown as WorldState,
      1,
      Wpx,
      Hpx,
    )
    expect(winter.count).toBeGreaterThanOrEqual(160)
  })

  it('clears the layer when the sky clears', () => {
    const layer = new SpriteLayer()
    writePrecipitation(
      layer,
      0,
      world({ weather: { kind: 'rain', intensity: 1 } }) as unknown as WorldState,
      1,
      Wpx,
      Hpx,
    )
    expect(layer.count).toBeGreaterThan(0)
    writePrecipitation(layer, 0, world() as unknown as WorldState, 1, Wpx, Hpx)
    expect(layer.count).toBe(0)
  })
})
