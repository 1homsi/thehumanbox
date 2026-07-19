import { describe, expect, it } from 'vitest'
import { tourWorldCopy, welcomeStepsFor, worldsIntroCopy } from './playerWorldCopy'

describe('local-player copy', () => {
  it('describes every local runtime as owned and device-backed', () => {
    expect(welcomeStepsFor('local')[0].title).toBe('This is your Human Box')
    expect(welcomeStepsFor('local')[2].body).toContain('runs and saves on this device')
    expect(tourWorldCopy('local').closing).toContain('saved on this device')
    expect(worldsIntroCopy('local', true)).toContain('saved on this computer')
  })

  it('reserves server-continuity claims for the shared world', () => {
    expect(welcomeStepsFor('shared')[3].body).toContain('continuously on the server')
    expect(tourWorldCopy('shared').closing).toContain('keeps running online')
    expect(worldsIntroCopy('shared', true)).toContain('resets at the start of every month')
  })

  it('explains why browser-local worlds do not list shared archives', () => {
    expect(worldsIntroCopy('local', false)).toContain('does not connect to the Shared World server')
  })
})
