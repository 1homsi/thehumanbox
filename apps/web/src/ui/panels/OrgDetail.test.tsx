// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { OrgDetail } from './OrgDetail'
import { BondsRememberedSection, MemoriesSection } from './org-detail/memories'
import type { OrganismState } from '../../shared/types'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
const roots: Root[] = []
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
})

function org(id: string): OrganismState {
  return {
    id,
    name: id.toUpperCase(),
    lineage_id: 'L',
    alive: true,
    sex: 'female',
    age: 900,
    max_age: 5000,
    energy: 0.9,
    hydration: 0.9,
    health: 0.9,
    infection: 0,
    fear_level: 0,
    carrying: 0,
    carrying_type: 0,
    pregnant: false,
    thought: '',
    generation: 1,
    x: 0,
    y: 0,
    parent_id: '',
    traits: {
      aggression: 0.5,
      curiosity: 0.5,
      social_tendency: 0.5,
      memory_strength: 0.5,
      resilience: 0.5,
    },
  } as unknown as OrganismState
}

function panel(o: OrganismState) {
  return <OrgDetail org={o} onClose={() => {}} onFollow={() => {}} following={false} />
}

describe('OrgDetail', () => {
  it('closes the life modal when the panel shows another organism', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    act(() => root.render(panel(org('a'))))

    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Life"]')!.click())
    // The life modal is lazy-loaded, so poll until the import lands.
    await vi.waitFor(() => expect(document.querySelector('.life-modal')).not.toBeNull())

    act(() => root.render(panel(org('b'))))
    expect(document.querySelector('.life-modal')).toBeNull()
  })

  it('shows the founders of a tribe as generation 1, as the card does', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    act(() => root.render(panel({ ...org('a'), generation: 0 } as OrganismState)))
    const text = host.textContent ?? ''
    expect(text).toContain('gen 1')
    expect(text).not.toContain('gen 0')
  })

  it('names a bond partner as the player named them', () => {
    const partner = { ...org('b'), name: 'B-GEN', custom_name: 'Bea' } as OrganismState
    const self = { ...org('a'), org_trust: { b: 0.6 } } as unknown as OrganismState
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    act(() =>
      root.render(
        <OrgDetail
          org={self}
          organisms={[self, partner]}
          onClose={() => {}}
          onFollow={() => {}}
          following={false}
        />,
      ),
    )
    const bonds = document.querySelector('.relation-list')?.textContent ?? ''
    expect(bonds).toContain('Bea')
    expect(bonds).not.toContain('B-GEN')
  })

  it('names a remembered bond as the player named them', () => {
    const partner = { ...org('b'), name: 'B-GEN', custom_name: 'Bea' } as OrganismState
    const self = { ...org('a'), memories: [] } as unknown as OrganismState
    const detail = {
      memories: [
        {
          kind: 'bond',
          text: 'shared bread',
          emotion: 1,
          salience: 0.5,
          related_id: 'b',
          tick: 1,
          recalls: 0,
        },
      ],
    } as never
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    act(() => root.render(<BondsRememberedSection detail={detail} organisms={[self, partner]} />))
    const text = host.textContent ?? ''
    expect(text).toContain('Bea')
    expect(text).not.toContain('B-GEN')
  })

  it('names a remembered person in the link tooltip as the player named them', () => {
    const partner = { ...org('b'), name: 'B-GEN', custom_name: 'Bea' } as OrganismState
    const detail = {
      memories: [
        {
          kind: 'core',
          text: 'met at the well',
          emotion: 0,
          salience: 0.5,
          related_id: 'b',
          tick: 1,
          recalls: 0,
        },
      ],
    } as never
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    act(() => root.render(<MemoriesSection detail={detail} organisms={[partner]} />))
    const link = host.querySelector<HTMLButtonElement>('button[title]')!
    expect(link.title).toContain('Bea')
    expect(link.title).not.toContain('B-GEN')
  })
})
