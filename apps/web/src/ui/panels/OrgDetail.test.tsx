// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { OrgDetail } from './OrgDetail'
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
})
