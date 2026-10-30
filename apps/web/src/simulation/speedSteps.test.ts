import { describe, expect, it } from 'vitest'
import { SPEED_STEPS, formatAchievedSpeed, nextSpeedStep } from './speedSteps'

describe('speed steps', () => {
  it('steps up and down through the ladder from a step', () => {
    expect(nextSpeedStep(1, 1)).toBe(2)
    expect(nextSpeedStep(1, -1)).toBe(0.5)
    expect(nextSpeedStep(0.25, -1)).toBeNull()
    expect(nextSpeedStep(0.5, 1)).toBe(1)
  })

  it('steps to the next step from a speed between two steps, in the direction asked for', () => {
    expect(nextSpeedStep(3, 1)).toBe(5)
    expect(nextSpeedStep(3, -1)).toBe(2)
    expect(nextSpeedStep(15, 1)).toBe(20)
    expect(nextSpeedStep(15, -1)).toBe(10)
    expect(nextSpeedStep(40, 1)).toBe(50)
    expect(nextSpeedStep(40, -1)).toBe(20)
  })

  it('has nothing further to go at either end', () => {
    expect(nextSpeedStep(SPEED_STEPS[SPEED_STEPS.length - 1], 1)).toBeNull()
    expect(nextSpeedStep(SPEED_STEPS[0], -1)).toBeNull()
    expect(nextSpeedStep(5000, 1)).toBeNull()
    expect(nextSpeedStep(9000, 1)).toBeNull()
  })

  it('treats a speed a hair off a step as on it', () => {
    expect(nextSpeedStep(1.0000001, 1)).toBe(2)
    expect(nextSpeedStep(1.0000001, -1)).toBe(0.5)
  })

  it('refuses speeds that are not positive numbers', () => {
    expect(nextSpeedStep(0, 1)).toBeNull()
    expect(nextSpeedStep(-2, -1)).toBeNull()
    expect(nextSpeedStep(Number.NaN, 1)).toBeNull()
  })

  it('makes every step at least double the last, up to the top of the speed list', () => {
    expect(SPEED_STEPS[0]).toBe(0.25)
    expect(SPEED_STEPS[SPEED_STEPS.length - 1]).toBe(5000)
    for (let i = 1; i < SPEED_STEPS.length; i++) {
      expect(SPEED_STEPS[i] / SPEED_STEPS[i - 1]).toBeGreaterThanOrEqual(2)
    }
  })

  it('shows the speed a world really reaches in whole numbers from ten, a decimal from one, and two figures below', () => {
    expect(formatAchievedSpeed(37.6)).toBe('38×')
    expect(formatAchievedSpeed(3.14)).toBe('3.1×')
    expect(formatAchievedSpeed(0.02)).toBe('0.02×')
    expect(formatAchievedSpeed(0.456)).toBe('0.46×')
  })
})
