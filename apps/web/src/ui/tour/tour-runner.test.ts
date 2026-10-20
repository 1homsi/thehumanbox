// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { tourSteps } from './tour-runner'

describe('tour', () => {
  it('stays short: five steps at most, and it still says when a tribe needs you', () => {
    const steps = tourSteps('local')
    expect(steps.length).toBeLessThanOrEqual(5)
    const text = steps.map((s) => s.text).join(' ')
    expect(text).toContain('prayer')
    expect(text).toContain('on the brink')
  })
})
