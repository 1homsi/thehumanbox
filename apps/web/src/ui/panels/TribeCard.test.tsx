// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TribeCard } from './TribeCard'
import { useUIStore } from '../../state/store'
import type { OrganismState, WorldState } from '../../shared/types'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
const roots: Root[] = []
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
})

function person(id: string, lineage: string): OrganismState {
  return {
    id,
    name: id.toUpperCase(),
    lineage_id: lineage,
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
  } as unknown as OrganismState
}

/** Tribes a and b are both alive, or only the ones listed. */
function world(alive: string[]): WorldState {
  return {
    tick: 1,
    organisms: alive.map((l) => person(`p-${l}`, l)),
    lineage_names: { a: 'Ash', b: 'Bren' },
    battles: [],
    settlements: [],
  } as unknown as WorldState
}

function card(w: WorldState) {
  return <TribeCard world={w} onAnswer={() => {}} onTool={() => {}} onRename={() => {}} onTeach={() => {}} />
}

function typeInto(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setValue.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('TribeCard', () => {
  it('does not carry a rename draft over to another tribe', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)

    act(() => useUIStore.setState({ focus: 'lineage:a' }))
    act(() => root.render(card(world(['a', 'b']))))
    act(() => host.querySelector<HTMLButtonElement>('.tribe-card-rename')!.click())
    typeInto(host.querySelector<HTMLInputElement>('.tribe-card-name-input')!, 'Draft')

    // Tribe a dies out during the edit, the card hides, then the player focuses tribe b.
    act(() => useUIStore.setState({ focus: 'all' }))
    act(() => root.render(card(world(['b']))))
    act(() => useUIStore.setState({ focus: 'lineage:b' }))
    act(() => root.render(card(world(['b']))))

    expect(host.querySelector('.tribe-card-name-input')).toBeNull()
    expect(host.querySelector('.tribe-card-rename')?.textContent).toContain('Bren')
  })

  it('tells what the tribe has been through: a hungry winter and its war dead', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)

    const w = { ...world(['a', 'b']), lineage_lore: { a: { hungry_winter: 3, war_weary: 9 } } } as WorldState
    act(() => useUIStore.setState({ focus: 'lineage:a' }))
    act(() => root.render(card(w)))

    expect(host.textContent).toContain('remembers the hungry winter of year 3')
    expect(host.textContent).toContain('weary of war after 9 of their own fell in battle')
  })
})
