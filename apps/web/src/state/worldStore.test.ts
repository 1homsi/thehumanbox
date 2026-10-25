import { beforeEach, describe, expect, it } from 'vitest'
import type { WorldState } from '../shared/types'
import { knownTribeName, useWorldStore } from './worldStore'

const snapshot = (tick: number, lineage_names: Record<string, string>) =>
  ({ tick, organisms: [], lineage_names }) as unknown as WorldState

describe('knownTribeName', () => {
  beforeEach(() => {
    // Start each case from a new world: time rewinds to 0.
    useWorldStore.getState().setWorld(snapshot(0, {}))
  })

  it('keeps a name for a tribe that has died out within the same world', () => {
    useWorldStore.getState().setWorld(snapshot(100, { L1: 'Hearth' }))
    useWorldStore.getState().setWorld(snapshot(400, {}))
    expect(knownTribeName({}, 'L1')).toBe('Hearth')
  })

  it('forgets names from the previous world when time rewinds', () => {
    useWorldStore.getState().setWorld(snapshot(100, { L1: 'Hearth' }))
    useWorldStore.getState().setWorld(snapshot(0, { L2: 'Stone' }))
    expect(knownTribeName({}, 'L1')).toBeUndefined()
    expect(knownTribeName({}, 'L2')).toBe('Stone')
  })

  it('prefers the name in the current snapshot', () => {
    useWorldStore.getState().setWorld(snapshot(100, { L1: 'Hearth' }))
    expect(knownTribeName({ L1: 'River' }, 'L1')).toBe('River')
  })
})
