import { describe, expect, it } from 'vitest'
import {
  BRUSH_SIZES,
  LARGE_BRUSH_SIZES,
  brushTiles,
  isLargeBrush,
  nextBrush,
} from '../../ui/toolbar/dock-tabs'
import { SANDBOX_CATEGORIES, toolById } from '../sandbox'
import { BUILTIN_ACTIONS } from './registry'

const TOOLS = SANDBOX_CATEGORIES.flatMap((c) => c.tools)

const radiusAt = (id: string, brush: number) =>
  (toolById(id)?.build?.(0, 0, brush) as { radius?: number } | undefined)?.radius

describe('region-sized brushes', () => {
  it('offer 16 to 64 tiles after the six regular sizes, and step through both', () => {
    expect(BRUSH_SIZES.map(([size]) => size)).toEqual([1, 2, 3, 5, 8, 12])
    expect(LARGE_BRUSH_SIZES.map(([size]) => size)).toEqual([16, 24, 32, 48, 64])
    expect(nextBrush(11, 1)).toBe(15)
    expect(nextBrush(15, -1)).toBe(11)
    expect(nextBrush(63, 1)).toBeNull()
    expect(isLargeBrush(11)).toBe(false)
    expect(isLargeBrush(31)).toBe(true)
    expect(brushTiles(47)).toBe(48)
  })

  it('never send more than the larger of what the sim allows and what brush 11 sent before', () => {
    for (const action of BUILTIN_ACTIONS.actions) {
      if (action.target !== 'brush' || !action.radius) continue
      const { base, perBrush, max } = action.radius
      expect(max, action.id).toBeGreaterThanOrEqual(base + perBrush * 11)
      expect(radiusAt(action.id, 63), action.id).toBe(max)
      expect(radiusAt(action.id, 11), action.id).toBe(base + perBrush * 11)
    }
  })

  it('reach a region with the powers the sim lets reach that far', () => {
    expect(radiusAt('heal', 63)).toBe(64)
    expect(radiusAt('cure', 63)).toBe(64)
    expect(radiusAt('nuke', 63)).toBe(34)
    expect(radiusAt('grass', 63)).toBe(63)
    expect(radiusAt('sinkhole', 63)).toBe(13)
  })
})

describe('count tools', () => {
  it('found a tribe of the chosen size, kept between 1 and 50, and of 5 when untouched', () => {
    const tribe = toolById('spawn5')!
    expect(tribe.count).toMatchObject({ min: 1, max: 50, default: 5 })
    expect(tribe.build!(3, 4, 2)).toEqual({ cmd: 'spawn', x: 3, y: 4, count: 5 })
    expect(tribe.build!(3, 4, 2, 12)).toEqual({ cmd: 'spawn', x: 3, y: 4, count: 12 })
    expect(tribe.build!(3, 4, 2, 99)).toEqual({ cmd: 'spawn', x: 3, y: 4, count: 50 })
    expect(tribe.build!(3, 4, 2, 0)).toEqual({ cmd: 'spawn', x: 3, y: 4, count: 1 })
  })

  it('bring as many animals as chosen, up to the twelve the sim releases at once', () => {
    const deer = toolById('deer')!
    expect(deer.build!(3, 4, 2)).toEqual({ cmd: 'spawn_animal', x: 3, y: 4, kind: 'deer', count: 1 })
    expect(deer.build!(3, 4, 2, 7)).toEqual({ cmd: 'spawn_animal', x: 3, y: 4, kind: 'deer', count: 7 })
    expect(deer.build!(3, 4, 2, 40)).toEqual({ cmd: 'spawn_animal', x: 3, y: 4, kind: 'deer', count: 12 })
  })

  it('are the tribe and every single-animal spawn, none of which use the brush', () => {
    const counted = TOOLS.filter((t) => t.count).map((t) => t.id)
    expect(counted).toContain('spawn5')
    expect(counted).toContain('whale')
    expect(counted).not.toContain('spawn1')
    expect(counted).not.toContain('horde')
    expect(counted).not.toContain('plague')
    for (const id of counted) expect(toolById(id)?.target, id).toBe('point')
  })
})
