import { afterEach, describe, expect, it } from 'vitest'
import { benchHooksEnabled, installBenchHooks, type BenchHooks } from './bench-hooks'
import type { MapCamera, MapCommand } from './camera-controls'

const holder = globalThis as unknown as { window?: { __thbBench?: BenchHooks } }

function source() {
  const camera = { current: { x: 10, y: 20, zoom: 2 } as MapCamera }
  const command = { current: null as MapCommand | null }
  const world = {
    tick: 4321,
    grid: { width: 600, height: 300, origin_x: 4 },
    organisms: [{ alive: true }, { alive: false }, { alive: true }, {}],
  }
  return { camera, command, world: () => world }
}

describe('bench hooks', () => {
  afterEach(() => {
    delete holder.window
  })

  it('is switched on by ?bench only', () => {
    expect(benchHooksEnabled('?bench=1')).toBe(true)
    expect(benchHooksEnabled('?bench')).toBe(true)
    expect(benchHooksEnabled('')).toBe(false)
    expect(benchHooksEnabled('?renderer=canvas')).toBe(false)
  })

  it('publishes nothing without the switch', () => {
    holder.window = {}
    const off = installBenchHooks(source(), false)
    expect(holder.window.__thbBench).toBeUndefined()
    off()
  })

  it('lets a script read the camera, steer it and count the people', () => {
    holder.window = {}
    const src = source()
    const off = installBenchHooks(src, true)
    const hooks = holder.window.__thbBench!
    expect(hooks.tile).toBe(8)
    expect(hooks.camera()).toEqual({ x: 10, y: 20, zoom: 2 })
    // A copy: the script cannot write into the app's camera by accident.
    hooks.camera().zoom = 99
    expect(src.camera.current.zoom).toBe(2)
    hooks.command({ kind: 'fit' })
    expect(src.command.current).toEqual({ kind: 'fit' })
    expect(hooks.info()).toEqual({
      gridW: 600,
      gridH: 300,
      originX: 4,
      originY: 0,
      people: 2,
      tick: 4321,
      boats: [],
    })
    off()
    expect(holder.window.__thbBench).toBeUndefined()
  })
})
