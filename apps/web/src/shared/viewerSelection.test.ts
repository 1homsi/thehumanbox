import { describe, expect, it } from 'vitest'
import { reconcileFocus, reconcileViewerSelection } from './viewerSelection'

const world = {
  featured_org_id: 'first-player',
  organisms: [
    { id: 'first-player', alive: true },
    { id: 'chosen-player', alive: true },
    { id: 'dead-player', alive: false },
  ],
}

describe('reconcileViewerSelection', () => {
  it('does not open the featured player when the viewer has no selection', () => {
    expect(reconcileViewerSelection(null, world)).toBeNull()
  })

  it('keeps a player the viewer deliberately selected', () => {
    expect(reconcileViewerSelection('chosen-player', world)).toBe('chosen-player')
  })

  it('closes details after the selected player is no longer alive', () => {
    expect(reconcileViewerSelection('dead-player', world)).toBeNull()
  })
})

describe('reconcileFocus', () => {
  const tribes = {
    organisms: [
      { id: 'a', alive: true, lineage_id: 'L1' },
      { id: 'b', alive: false, lineage_id: 'L2' },
    ],
  }

  it('keeps everyone, the other focus kinds and a tribe that still has a living member', () => {
    expect(reconcileFocus('all', tribes)).toBe('all')
    expect(reconcileFocus('lineage:L1', tribes)).toBe('lineage:L1')
  })

  it('trusts the server census for members born since the last deep frame, which carry no lineage_id yet', () => {
    const newborns = {
      organisms: [{ id: 'n', alive: true }],
      lineage_sizes: [{ id: 'L3', count: 2 }],
      tribes_in_peril: [{ lineage_id: 'L4' }],
    }
    expect(reconcileFocus('lineage:L3', newborns)).toBe('lineage:L3')
    expect(reconcileFocus('lineage:L4', newborns)).toBe('lineage:L4')
    expect(reconcileFocus('lineage:L5', { ...newborns, lineage_sizes: [{ id: 'L5', count: 0 }] })).toBe('all')
  })

  it('drops the focus on a tribe that died out or is gone, so the map is not left dimmed', () => {
    expect(reconcileFocus('lineage:L2', tribes)).toBe('all')
    expect(reconcileFocus('lineage:L9', tribes)).toBe('all')
  })
})
