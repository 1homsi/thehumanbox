// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { OrgSearchModal } from './OrgSearchModal'
import type { OrganismState } from '../../shared/types'

// The person's detail pane has its own data hooks; the list and its controls are what is under test.
vi.mock('../panels/OrgDetail', () => ({ OrgDetail: () => null }))

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
const roots: Array<{ unmount: () => void }> = []
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
})

function organism(id: string): OrganismState {
  return {
    id,
    name: `person ${id}`,
    alive: true,
    age: 6000,
    generation: 1,
    thought: '',
    energy: 1,
    hydration: 1,
    health: 1,
    lineage_id: 'lineage-a',
    aspiration: 'seeker',
    discoveries: [],
    sex: 'male',
  } as unknown as OrganismState
}

function render(organisms: OrganismState[]) {
  const root = createRoot(document.createElement('div'))
  roots.push(root)
  act(() => root.render(<OrgSearchModal organisms={organisms} onClose={() => {}} />))
}

const el = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!

describe('OrgSearchModal', () => {
  it('keeps the group separator before the tribe dropdown (a phone hides it in CSS, not in the markup)', () => {
    render([organism('a')])
    expect(el('.org-search-filters').lastElementChild?.classList.contains('filter-sep')).toBe(true)
  })

  it('returning from a person to the list starts the list at the top', () => {
    render([organism('a'), organism('b')])
    const list = el('.org-search-list')
    list.scrollTop = 240
    act(() => el('.org-search-entry').click())
    act(() => el('.org-search-back').click())
    expect(list.scrollTop).toBe(0)
  })

  it('finds a renamed person by the name their card shows', () => {
    render([{ ...organism('a'), name: 'Ada', custom_name: 'Bob' } as OrganismState, organism('b')])
    const search = el<HTMLInputElement>('.org-search-input')
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'bob')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const names = [...document.querySelectorAll('.org-search-entry')].map((e) => e.textContent ?? '')
    expect(names).toHaveLength(1)
    expect(names[0]).toContain('Bob')
  })

  it('a desktop deselect of the row under the pointer keeps the list where it was', () => {
    render([organism('a'), organism('b')])
    const list = el('.org-search-list')
    list.scrollTop = 240
    act(() => el('.org-search-entry').click())
    act(() => el('.org-search-entry').click())
    expect(list.scrollTop).toBe(240)
  })

  it('shows a founder as generation 1, as the card does', () => {
    render([{ ...organism('a'), generation: 0 } as OrganismState])
    const meta = el('.org-search-meta').textContent ?? ''
    expect(meta).toContain('g1')
    expect(meta).not.toContain('g0')
  })

  it('an Escape with the tribe list open closes the list and keeps the search open', () => {
    const onClose = vi.fn()
    const root = createRoot(document.createElement('div'))
    roots.push(root)
    act(() => root.render(<OrgSearchModal organisms={[organism('a')]} onClose={onClose} />))
    act(() => el('.tribe-dropdown-btn').click())
    expect(el('.tribe-dropdown-menu')).not.toBeNull()

    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      )
    })
    expect(el('.tribe-dropdown-menu')).toBeNull()
    expect(el('.org-search-input')).not.toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('a second Escape closes the search', () => {
    const onClose = vi.fn()
    const root = createRoot(document.createElement('div'))
    roots.push(root)
    act(() => root.render(<OrgSearchModal organisms={[organism('a')]} onClose={onClose} />))
    act(() => el('.tribe-dropdown-btn').click())
    const escape = () =>
      act(() => {
        document.body.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        )
      })
    escape()
    escape()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
