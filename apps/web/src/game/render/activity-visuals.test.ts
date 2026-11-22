import { describe, expect, it } from 'vitest'
import {
  BEAT_ABOVE,
  BEAT_PERIOD,
  POSE_SHEETS,
  TOOL_HEADS,
  WORK_ACTIVITIES,
  activityCode,
  poseLift,
  workActivity,
} from './activity-visuals'

describe('visible work actions', () => {
  it('shows current labor and rest', () => {
    expect(workActivity('repairing our House', false)).toBe('build')
    expect(workActivity('reclaiming an abandoned Hut', false)).toBe('build')
    expect(workActivity('gathering wood', false)).toBe('chop')
    expect(workActivity('harvesting', false)).toBe('farm')
    expect(workActivity('fishing', false)).toBe('fish')
    expect(workActivity('caught a fish', false)).toBe('fish')
    expect(workActivity('felling trees', false)).toBe('chop')
    expect(workActivity('stalking game', false)).toBe('hunt')
    expect(workActivity('checking the traps', false)).toBe('hunt')
    expect(workActivity('sleeping', false)).toBe('rest')
  })
  it('does not turn intent or locomotion into stationary work', () => {
    expect(workActivity('repairing our House', true)).toBeNull()
    expect(workActivity('seeking fishing spot', false)).toBeNull()
    expect(workActivity('going hunting', false)).toBeNull()
    expect(workActivity('planning building', false)).toBeNull()
    expect(workActivity('observing', false)).toBeNull()
  })
  it('gives each kind of work its own tool and pose', () => {
    expect(workActivity('chopping wood', false)).toBe('chop')
    expect(workActivity('gathering timber', false)).toBe('chop')
    expect(workActivity('quarrying stone', false)).toBe('mine')
    expect(workActivity('digging ore', false)).toBe('mine')
    expect(workActivity('digging a well', false)).toBe('dig')
    expect(workActivity('digging for roots', false)).toBe('dig')
    expect(workActivity('planting a sapling', false)).toBe('till')
    expect(workActivity('harvesting the field', false)).toBe('farm')
    expect(workActivity('building shelter', false)).toBe('build')
    expect(workActivity('fishing the shallows', false)).toBe('fish')
    expect(workActivity('hunting', false)).toBe('hunt')
    expect(workActivity('foraging for berries', false)).toBe('gather')
    expect(workActivity('cooking', false)).toBe('cook')
    expect(workActivity('tending fire', false)).toBe('cook')
    expect(workActivity('weaving a basket', false)).toBe('craft')
    expect(workActivity('eating stored food', false)).toBe('eat')
    expect(workActivity("drinking at the water's edge", false)).toBe('drink')
    expect(workActivity('talking', false)).toBe('talk')
    expect(workActivity('teaching Neni', false)).toBe('talk')
    expect(workActivity('dancing by the fire', false)).toBe('dance')
    expect(workActivity('playing with the kids', false)).toBe('dance')
    expect(workActivity('challenging', false)).toBe('fight')
    expect(workActivity('resting with kin', false)).toBe('rest')
  })
  it('does not read an action into a word that only contains one', () => {
    expect(workActivity('repeating the old words', false)).toBeNull()
    expect(workActivity('defeating despair', false)).toBeNull()
    expect(workActivity('interesting times', false)).toBeNull()
    expect(workActivity('visiting kin', false)).toBeNull()
    expect(workActivity('wandering', false)).toBeNull()
    expect(workActivity('eating', true)).toBeNull()
  })
  it('numbers every activity for the sprite layer and keeps a body beat for the swung tools', () => {
    expect(activityCode(null)).toBe(0)
    const codes = WORK_ACTIVITIES.map((a) => activityCode(a))
    expect(new Set(codes).size).toBe(WORK_ACTIVITIES.length)
    expect(Math.min(...codes)).toBe(1)
    expect(BEAT_PERIOD.length).toBe(WORK_ACTIVITIES.length + 1)
    for (const tool of Object.keys(TOOL_HEADS) as (keyof typeof TOOL_HEADS)[]) {
      expect(BEAT_PERIOD[activityCode(tool)]).toBe(180)
      expect(BEAT_ABOVE[activityCode(tool)]).toBeCloseTo(0.3, 6)
    }
    expect(BEAT_PERIOD[activityCode('dig')]).toBe(POSE_SHEETS.dig.period)
    expect(BEAT_PERIOD[activityCode('rest')]).toBe(0)
    expect(BEAT_PERIOD[activityCode('eat')]).toBe(0)
    expect(BEAT_ABOVE[activityCode('hunt')]).toBeLessThan(-1)
  })
  it('draws every tool head differently and keeps each pose small', () => {
    const heads = Object.values(TOOL_HEADS).map((h) => `${h.css},${h.x},${h.y},${h.w},${h.h}`)
    expect(new Set(heads).size).toBe(heads.length)
    for (const sheet of Object.values(POSE_SHEETS)) {
      expect(sheet.period).toBeGreaterThan(0)
      expect(sheet.parts.length).toBeGreaterThan(0)
      expect(sheet.parts.length).toBeLessThanOrEqual(8)
      for (const p of sheet.parts) {
        expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true)
        expect(Number.isInteger(p.w) && Number.isInteger(p.h)).toBe(true)
        expect(Math.abs(p.x)).toBeLessThanOrEqual(14)
        expect(p.y).toBeGreaterThanOrEqual(-16)
        expect(p.y + p.h).toBeLessThanOrEqual(3)
      }
    }
  })
  it('lowers a pose held at the head for a shorter figure, and leaves ground poses alone', () => {
    expect(poseLift('eat', 16)).toBe(0)
    expect(poseLift('eat', 10)).toBe(6)
    expect(poseLift('talk', 14)).toBe(2)
    expect(poseLift('dig', 10)).toBe(0)
    expect(poseLift('chop', 10)).toBe(0)
    expect(poseLift(null, 10)).toBe(0)
  })
})
