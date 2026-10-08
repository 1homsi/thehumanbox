import { describe, expect, it } from 'vitest'
import { SPEED_STEPS, nextSpeedStep } from './speedSteps'

describe('speed steps', () => {
  it('steps up and down through the ladder from a step', () => {
    expect(nextSpeedStep(1, 1)).toBe(2)
    expect(nextSpeedStep(1, -1)).toBe(0.5)
    expect(nextSpeedStep(0.25, -1)).toBeNull()
    expect(nextSpeedStep(0.5, 1)).toBe(1)
  })

  it('steps to the next step from a speed between two steps, in the direction asked for', () => {
    expect(nextSpeedStep(3, 1)).toBe(4)
    expect(nextSpeedStep(3, -1)).toBe(2)
    expect(nextSpeedStep(15, 1)).toBe(20)
    expect(nextSpeedStep(15, -1)).toBe(10)
  })

  it('has nothing further to go at either end', () => {
    expect(nextSpeedStep(SPEED_STEPS[SPEED_STEPS.length - 1], 1)).toBeNull()
    expect(nextSpeedStep(SPEED_STEPS[0], -1)).toBeNull()
    expect(nextSpeedStep(100, 1)).toBeNull()
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

  it('keeps the ladder finer than the preset tiles at the bottom and top', () => {
    expect(SPEED_STEPS[0]).toBe(0.25)
    expect(SPEED_STEPS).toContain(8)
    expect(SPEED_STEPS).toContain(20)
  })
})
