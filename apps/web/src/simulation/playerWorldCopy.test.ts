import { describe, expect, it } from 'vitest'
import { tourWorldCopy, welcomeStepsFor, worldsIntroCopy } from './playerWorldCopy'

describe('local-player copy', () => {
  it('describes every local runtime as owned and device-backed', () => {
    const steps = welcomeStepsFor('local')
    expect(steps[0].title).toBe('You are their god')
    expect(steps[steps.length - 1].body).toContain('runs and saves on this device')
    expect(tourWorldCopy('local').closing).toContain('saved on this device')
    expect(worldsIntroCopy('local', true)).toContain('saved on this computer')
  })

  it('explains that browser worlds never use a hosted simulation', () => {
    expect(worldsIntroCopy('local', false)).toContain('never connects to a hosted simulation server')
  })

  it('puts the player at the centre: prayers, peril, the ages', () => {
    const text = welcomeStepsFor('local')
      .map((s) => `${s.title} ${s.body}`)
      .join(' ')
    for (const idea of ['pray', 'on the brink', 'ages']) expect(text).toContain(idea)
  })
})
