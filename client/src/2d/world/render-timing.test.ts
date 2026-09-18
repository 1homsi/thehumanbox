import { describe, expect, it } from 'vitest'
import { interpolationFactor, shouldRenderFrame, worldRenderScale, worldRenderWindow } from './render-timing'

describe('world render pacing', () => {
  it('caps drawing at 30fps on both 60Hz and 120Hz displays', () => {
    for (const hz of [60, 120]) {
      let previous = -Infinity
      let count = 0
      for (let frame = 0; frame < hz; frame++) {
        const now = (frame * 1000) / hz
        if (shouldRenderFrame(now, previous, 30)) {
          previous = now
          count++
        }
      }
      expect(count).toBe(30)
    }
  })

  it('low-perf mode never increases the texture resolution', () => {
    for (const zoom of [0.05, 0.12, 0.2, 0.5, 1, 2, 8]) {
      expect(worldRenderScale(zoom, 2, true)).toBeLessThanOrEqual(worldRenderScale(zoom, 2, false))
    }
  })

  it('reaches the current snapshot before the next one arrives without a half-tick jump', () => {
    expect(interpolationFactor(1000, 1000, 120)).toBe(0)
    expect(interpolationFactor(1060, 1000, 120)).toBe(0.5)
    expect(interpolationFactor(1120, 1000, 120)).toBe(1)
    expect(interpolationFactor(2000, 1000, 120)).toBe(1)
  })
})

describe('viewport texture bounds', () => {
  it('keeps zoomed-in uploads smaller than the world while covering the screen', () => {
    const area = worldRenderWindow(4800, 2400, { x: 2400, y: 1200, zoom: 2 }, { w: 1200, h: 800 })
    expect(area.x).toBeLessThanOrEqual(2100)
    expect(area.x + area.width).toBeGreaterThanOrEqual(2700)
    expect(area.y).toBeLessThanOrEqual(1000)
    expect(area.y + area.height).toBeGreaterThanOrEqual(1400)
    expect(area.width * area.height).toBeLessThan((4800 * 2400) / 10)
  })
  it('covers the whole map at overview zoom and clamps texture edges', () => {
    expect(worldRenderWindow(4800, 2400, { x: 2400, y: 1200, zoom: 0.2 }, { w: 1200, h: 800 })).toEqual({
      x: 0,
      y: 0,
      width: 4800,
      height: 2400,
    })
    const edge = worldRenderWindow(4800, 2400, { x: 4800, y: 2400, zoom: 2 }, { w: 1200, h: 800 })
    expect(edge.x + edge.width).toBe(4800)
    expect(edge.y + edge.height).toBe(2400)
  })
})
