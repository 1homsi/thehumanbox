import { describe, expect, it } from 'vitest'
import { reconcileViewerSelection } from './viewerSelection'

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
