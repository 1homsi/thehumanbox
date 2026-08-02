import { describe, expect, it } from 'vitest'
import { WEB_BASE_TICK_MS, WEB_POPULATION_LIMIT, WEB_WORLD_PUBLISH_MS } from './webRuntime'

describe('browser simulation profile', () => {
  it('keeps the local web world bounded and responsive', () => {
    expect(WEB_POPULATION_LIMIT).toBe(200)
    expect(WEB_BASE_TICK_MS).toBeGreaterThanOrEqual(250)
    expect(WEB_WORLD_PUBLISH_MS).toBeGreaterThanOrEqual(1_000)
  })
})
