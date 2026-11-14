// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { OrganismState, WorldState } from '../../shared/types'
import { useUIStore } from '../../state/store'
import { RightPanel } from './RightPanel'

// The cards are lazy chunks in the app; keep them small and synchronous here.
vi.mock('./OrgCard', () => ({
  OrgCard: ({ orgId }: { orgId: string }) => <div className="fake-org-card">{orgId}</div>,
}))
vi.mock('./OrgDetail', () => ({ OrgDetail: () => null }))

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
  useUIStore.setState({ panelOpen: false, selectedOrgId: null, renamingOrgId: null })
})

const person = (i: number) =>
  ({
    id: `p${i}`,
    name: `Person${i}`,
    alive: true,
    age: 1000,
    max_age: 12000,
    generation: 1,
    thought: '',
    lineage_id: 'L',
  }) as unknown as OrganismState

async function renderPanel(people: OrganismState[], selectedOrg: OrganismState | null = null) {
  const world = { organisms: people, lineage_names: {} } as unknown as WorldState
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () =>
    root?.render(<RightPanel world={world} liveOrgs={people} deadOrgs={[]} selectedOrg={selectedOrg} />),
  )
  return host
}

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

  it('shows the name box for a person past the first page of cards', async () => {
    const people = Array.from({ length: 100 }, (_, i) => person(i))
    const host = await renderPanel(people)

    await act(async () => useUIStore.getState().startRename('p99'))

    // The list draws only its first page, so that person's card is not there...
    const cards = [...host.querySelectorAll('.fake-org-card')].map((card) => card.textContent)
    expect(cards).toHaveLength(80)
    expect(cards).not.toContain('p99')

    // ...but the name tool still gives the player a visible field, already focused.
    const input = host.querySelector<HTMLInputElement>('.org-rename-panel input')
    expect(input).not.toBeNull()
    expect(document.activeElement).toBe(input)
    expect(host.querySelectorAll('input')).toHaveLength(1)
  })

  it('shows one name box, at the top, for a person whose card is on the first page', async () => {
    const people = Array.from({ length: 100 }, (_, i) => person(i))
    const host = await renderPanel(people, people[5])

    await act(async () => useUIStore.getState().startRename('p5'))

    expect(host.querySelectorAll('input')).toHaveLength(1)
    expect(host.querySelector('.org-rename-panel input')).toBe(document.activeElement)
  })

  it('starts empty-fresh when the name tool is pointed at someone else', async () => {
    const people = Array.from({ length: 100 }, (_, i) => person(i))
    const host = await renderPanel(people, people[5])

    await act(async () => useUIStore.getState().startRename('p5'))
    await act(async () => useUIStore.getState().startRename('p6'))

    const input = host.querySelector<HTMLInputElement>('.org-rename-panel input')
    expect(input?.value).toBe('Person6')
    expect(input).toBe(document.activeElement)
  })
})
