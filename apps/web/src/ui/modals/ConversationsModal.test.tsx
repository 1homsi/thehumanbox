// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { OrganismState } from '../../shared/types'
import { ConversationsModal } from './ConversationsModal'

// The conversation log is a query; the test supplies one entry and leaves the network alone.
vi.mock('../../shared/hooks/useOrgConversations', () => ({
  useOrgConversations: () => ({
    isLoading: false,
    data: {
      conversations: [
        {
          tick: 1200,
          with_id: 'b',
          with_name: 'B-GEN',
          kind: 'chat',
          lines: [['A-GEN', 'hello']],
          meanings: [],
        },
      ],
    },
  }),
}))

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
})

function person(id: string, name: string, custom?: string): OrganismState {
  return {
    id,
    name,
    custom_name: custom,
    alive: true,
    sex: 'male',
    lineage_id: 'L',
    age: 900,
    generation: 0,
    traits: {},
  } as unknown as OrganismState
}

describe('ConversationsModal', () => {
  it('names both participants as the player named them', () => {
    const self = person('a', 'A-GEN', 'Ann')
    const partner = person('b', 'B-GEN', 'Bea')
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() =>
      root?.render(
        <ConversationsModal
          org={{ ...self, partner_id: 'b' } as OrganismState}
          allOrgs={[self, partner]}
          onClose={() => {}}
        />,
      ),
    )
    // The transcript keeps the names as they were spoken; the header names who is talking now.
    const participants = document.querySelector('.cv-participants')?.textContent ?? ''
    expect(participants).toContain('Ann')
    expect(participants).not.toContain('A-GEN')
    expect(participants).toContain('Bea')
    expect(participants).not.toContain('B-GEN')
    const who = document.querySelector('.cv-modal-who')?.textContent ?? ''
    expect(who).toContain('Ann')
    expect(who).toContain('Bea')
  })
})
