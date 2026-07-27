import { describe, expect, it } from 'vitest'
import { tourWorldCopy, welcomeStepsFor, worldsIntroCopy } from './playerWorldCopy'

describe('local-player copy', () => {
  it('describes every local runtime as owned and device-backed', () => {
    expect(welcomeStepsFor('local')[0].title).toBe('This is your Human Box')
    expect(welcomeStepsFor('local')[2].body).toContain('runs and saves on this device')
    expect(tourWorldCopy('local').closing).toContain('saved on this device')
    expect(worldsIntroCopy('local', true)).toContain('saved on this computer')
  })

  it('explains that browser worlds never use a hosted simulation', () => {
    expect(worldsIntroCopy('local', false)).toContain('never connects to a hosted simulation server')
  })
})
