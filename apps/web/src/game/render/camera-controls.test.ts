import { describe, expect, it } from 'vitest'
import {
  clampMapCamera,
  doubleClickZoomTarget,
  DOUBLE_CLICK_ZOOM_MS,
  initialMapCamera,
  MAX_MAP_ZOOM,
  minMapZoom,
  screenToMap,
  zoomMapAt,
  zoomTweenAt,
} from './camera-controls'

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

  it('zooms twice as close on a double-click, twice as far with Shift, within the limits', () => {
    expect(doubleClickZoomTarget(2, false, 0.5, MAX_MAP_ZOOM)).toBe(4)
    expect(doubleClickZoomTarget(2, true, 0.5, MAX_MAP_ZOOM)).toBe(1)
    expect(doubleClickZoomTarget(6, false, 0.5, MAX_MAP_ZOOM)).toBe(MAX_MAP_ZOOM)
    expect(doubleClickZoomTarget(0.8, true, 0.5, MAX_MAP_ZOOM)).toBe(0.5)
  })

  it('eases a double-click zoom from where it was to where it is going', () => {
    expect(zoomTweenAt(2, 4, 0)).toBe(2)
    expect(zoomTweenAt(2, 4, DOUBLE_CLICK_ZOOM_MS)).toBeCloseTo(4)
    expect(zoomTweenAt(2, 4, DOUBLE_CLICK_ZOOM_MS * 5)).toBeCloseTo(4)
    const halfway = zoomTweenAt(2, 4, DOUBLE_CLICK_ZOOM_MS / 2)
    // Eased out: past the middle of the scale step at half the time.
    expect(halfway).toBeGreaterThan(Math.SQRT2 * 2)
    expect(halfway).toBeLessThan(4)
    expect(zoomTweenAt(4, 2, DOUBLE_CLICK_ZOOM_MS / 2)).toBeLessThan(Math.SQRT2 * 2)
  })

  it('keeps the double-clicked spot under the pointer all the way in', () => {
    const viewport = { w: 800, h: 600 }
    const start = { x: 300, y: 200, zoom: 2 }
    const point = { x: 650, y: 120 }
    const spot = screenToMap(start, point, viewport)
    for (const elapsed of [0, 40, 90, 140, DOUBLE_CLICK_ZOOM_MS]) {
      const camera = zoomMapAt(start, zoomTweenAt(2, 4, elapsed), point, viewport)
      const under = screenToMap(camera, point, viewport)
      expect(under.x).toBeCloseTo(spot.x)
      expect(under.y).toBeCloseTo(spot.y)
    }
  })
})
