import { describe, expect, it } from 'vitest'
import { eventTarget } from './event-target'

const world = {
  lineage_names: { l1: 'Ashfolk', l2: 'Lupif' },
  settlements: [{ lineage_id: 'l1', center: [40, 50] }],
  organisms: [
    { id: 'p1', name: 'Zuhe', lineage_id: 'l2', x: 10, y: 20, alive: true },
    { id: 'p2', name: 'Gone', lineage_id: 'l2', x: 30, y: 40, alive: false },
  ],
} as never

describe('event targets', () => {
  it('finds a tribe by its name, with or without "the"', () => {
    expect(eventTarget(world, { actor: 'Ashfolk' })).toEqual({
      kind: 'tribe',
      lineage: 'l1',
      at: { x: 40, y: 50 },
    })
    expect(eventTarget(world, { actor: 'the Lupif' })).toEqual({
      kind: 'tribe',
      lineage: 'l2',
      at: { x: 10, y: 20 },
    })
  })

  it('finds a living person by name', () => {
    expect(eventTarget(world, { actor: 'Zuhe' })).toEqual({ kind: 'person', id: 'p1', at: { x: 10, y: 20 } })
    expect(eventTarget(world, { actor: 'Gone' })).toBeNull()
  })

  it('ignores actors that are not on the map', () => {
    expect(eventTarget(world, { actor: 'a flood' })).toBeNull()
    expect(eventTarget(world, { actor: 'world' })).toBeNull()
  })
})
