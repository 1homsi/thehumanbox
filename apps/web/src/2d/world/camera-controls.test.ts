import { describe, expect, it } from 'vitest'
import { clampMapCamera, initialMapCamera, minMapZoom, screenToMap, zoomMapAt } from './camera-controls'

const viewport = { w: 800, h: 600 }
const world = { w: 4800, h: 2400 }
describe('2D map navigation', () => {
  it('keeps the same world point under the cursor through repeated zooms', () => {
    let camera = { x: 2200, y: 1100, zoom: 1 }
    const point = { x: 630, y: 125 }
    const anchor = screenToMap(camera, point, viewport)
    for (const zoom of [1.3, 2, 4, 0.5, 1]) {
      camera = zoomMapAt(camera, zoom, point, viewport)
      const actual = screenToMap(camera, point, viewport)
      expect(actual.x).toBeCloseTo(anchor.x, 8)
      expect(actual.y).toBeCloseTo(anchor.y, 8)
    }
  })
  it('centers an overview instead of allowing the world to be dragged offscreen', () => {
    expect(clampMapCamera({ x: -2000, y: 9000, zoom: 0.1 }, world, viewport)).toEqual({
      x: 2400,
      y: 1200,
      zoom: 0.1,
    })
  })
  it('keeps close views inside the map on all four edges', () => {
    expect(clampMapCamera({ x: -100, y: -100, zoom: 2 }, world, viewport)).toEqual({
      x: 200,
      y: 150,
      zoom: 2,
    })
    expect(clampMapCamera({ x: 9000, y: 9000, zoom: 2 }, world, viewport)).toEqual({
      x: 4600,
      y: 2250,
      zoom: 2,
    })
  })
  it('centers only the axis that fits inside the viewport', () => {
    expect(clampMapCamera({ x: 1000, y: 2000, zoom: 0.2 }, world, viewport)).toEqual({
      x: 2000,
      y: 1200,
      zoom: 0.2,
    })
  })
  it('waits for a measured viewport before choosing the opening view', () => {
    expect(initialMapCamera(world, { w: 0, h: 0 })).toBeNull()
    expect(initialMapCamera(world, { w: 800, h: 0 })).toBeNull()
    const opening = initialMapCamera(world, viewport)!
    expect(opening.x).toBe(2400)
    expect(opening.y).toBe(1200)
    // The whole world fits, with a little sea around it.
    expect(opening.zoom * world.w).toBeLessThanOrEqual(viewport.w)
    expect(opening.zoom).toBeGreaterThan(minMapZoom(world, viewport))
  })
  it('never keeps a camera zoomed to nothing', () => {
    for (const zoom of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const camera = clampMapCamera({ x: 10, y: 10, zoom }, world, viewport)
      expect(camera.zoom).toBeCloseTo(initialMapCamera(world, viewport)!.zoom)
      expect(camera.x).toBe(2400)
    }
  })
})
