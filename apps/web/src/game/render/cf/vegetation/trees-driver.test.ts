// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { SpriteLayer } from 'cubeforge'
import type { WorldState } from '../../../../shared/types'
import type { CellAtlas } from '../atlas/cell-atlas'
import { makeFrame } from '../frame'
import { TreesDriver } from './trees-driver'

/** A driver holding a few swaying trees, without the images and atlases that place real ones. */
function driverWithTrees() {
  const sway = new SpriteLayer()
  // The wind only asks the atlas for each canopy's cell.
  const atlas = {
    epoch: 0,
    bake: () => ({ atlas: 0, frame: 1, cw: 18, ch: 12 }),
  } as unknown as CellAtlas
  const driver = new TreesDriver(new SpriteLayer(), sway, atlas, new SpriteLayer())
  const trees = [0, 1, 2].map((i) => ({
    dx: 40 + i * 20,
    dy: 40,
    w: 16,
    h: 16,
    cell: { atlas: 0, frame: 0, cw: 18, ch: 18 },
    sortKey: 56,
    crop: null,
    tile: [0, 0] as const,
    sways: true,
    phase: i,
    cx: 48 + i * 20,
    cy: 56,
    sz: 16,
  }))
  const inner = driver as unknown as { sprites: unknown[]; bottoms: number[] }
  inner.sprites = trees
  inner.bottoms = trees.map((t) => t.cy)
  return { driver, sway }
}

const world = {
  grid: { width: 40, height: 30, origin_x: 0, origin_y: 0 },
  weather: { kind: 'clear', wind_x: 0.5 },
} as unknown as WorldState

function frame(now: number, camera = { x: 100, y: 60, zoom: 3 }) {
  return makeFrame(world, undefined, camera, { w: 800, h: 500 }, now, 2, 1)
}

describe('trees driver wind', () => {
  it('rewrites the canopies about 12 times a second, not on every frame', () => {
    const { driver, sway } = driverWithTrees()
    // Find a moment where the wind has moved at least one canopy a pixel.
    let t = 0
    while (!driver.update(frame(t)) && t < 5000) t += 1000
    expect(sway.count).toBeGreaterThan(0)
    const first = sway.version
    // A frame 16 ms later (60 fps) and one 33 ms later (30 fps) leave the layer as it was.
    expect(driver.update(frame(t + 16))).toBe(false)
    expect(driver.update(frame(t + 33))).toBe(false)
    expect(sway.version).toBe(first)
    // 100 ms later it is rewritten.
    driver.update(frame(t + 100))
    expect(sway.version).toBeGreaterThan(first)
  })

  it('rewrites at once when the view moves', () => {
    const { driver } = driverWithTrees()
    let t = 0
    while (!driver.update(frame(t)) && t < 5000) t += 1000
    expect(driver.update(frame(t + 10))).toBe(false)
    expect(driver.update(frame(t + 10, { x: 130, y: 60, zoom: 3 }))).toBe(true)
  })

  it('does not sway zoomed out', () => {
    const { driver, sway } = driverWithTrees()
    expect(driver.update(frame(1000, { x: 100, y: 60, zoom: 0.3 }))).toBe(false)
    expect(sway.count).toBe(0)
  })
})
