// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { OrganismState, WorldState } from '../../shared/types'
import { useUIStore } from '../../state/store'
import { RightPanel } from './RightPanel'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
})

describe('RightPanel', () => {
  it('shows a dead person’s age in years, as the living cards do, not in ticks', () => {
    useUIStore.setState({ panelOpen: true })
    const dead = {
      id: 'd',
      name: 'Dee',
      alive: false,
      age: 6000,
      max_age: 12000,
      generation: 1,
      thought: '',
      lineage_id: 'L',
    } as unknown as OrganismState
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() =>
      root?.render(
        <RightPanel
          world={{ organisms: [dead], lineage_names: {} } as unknown as WorldState}
          liveOrgs={[]}
          deadOrgs={[dead]}
          selectedOrg={null}
        />,
      ),
    )
    const card = document.querySelector('.org-card.dead')?.textContent ?? ''
    expect(card).toContain('Dee')
    expect(card).not.toContain('6000')
    expect(card).toContain('yrs')
  })
})
