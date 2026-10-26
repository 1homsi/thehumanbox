// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TribeCard } from './TribeCard'
import { useUIStore } from '../../state/store'
import { useWorldStore } from '../../state/worldStore'
import { t } from '../../i18n'
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
  return (
    <TribeCard
      world={w}
      onAnswer={() => {}}
      onTool={() => {}}
      onRename={() => Promise.resolve(true)}
      onTeach={() => {}}
    />
  )
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

  it('an Enter that commits a composed name does not rename the tribe yet', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    const onRename = vi.fn(() => Promise.resolve(true))

    act(() => useUIStore.setState({ focus: 'lineage:a' }))
    act(() =>
      root.render(
        <TribeCard
          world={world(['a', 'b'])}
          onAnswer={() => {}}
          onTool={() => {}}
          onRename={onRename}
          onTeach={() => {}}
        />,
      ),
    )
    act(() => host.querySelector<HTMLButtonElement>('.tribe-card-rename')!.click())
    const input = host.querySelector<HTMLInputElement>('.tribe-card-name-input')!
    typeInto(input, 'Ashen')
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))
    })

    expect(onRename).not.toHaveBeenCalled()
    expect(host.querySelector('.tribe-card-name-input')).not.toBeNull()
  })

  it('groups a large tribe and its sick count the way the rest of the interface does', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    const crowd = Array.from({ length: 1234 }, (_, i) => ({ ...person(`p-${i}`, 'a'), infection: 0.5 }))

    act(() => useUIStore.setState({ focus: 'lineage:a' }))
    act(() => root.render(card({ ...world(['a']), organisms: crowd } as WorldState)))

    expect(host.querySelector('.tribe-card-sub')?.textContent).toContain('1,234 people')
    expect(host.querySelector('.tribe-sick')?.textContent).toBe('1,234 sick')
  })

  it('a refused tribe name keeps the field open and says the name was not saved', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    const onRename = vi.fn(() => Promise.resolve(false))

    act(() => useUIStore.setState({ focus: 'lineage:a' }))
    act(() =>
      root.render(
        <TribeCard
          world={world(['a', 'b'])}
          onAnswer={() => {}}
          onTool={() => {}}
          onRename={onRename}
          onTeach={() => {}}
        />,
      ),
    )
    act(() => host.querySelector<HTMLButtonElement>('.tribe-card-rename')!.click())
    const input = host.querySelector<HTMLInputElement>('.tribe-card-name-input')!
    typeInto(input, 'Ashen')
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))

    expect(onRename).toHaveBeenCalledWith('a', 'Ashen')
    expect(host.querySelector('.tribe-card-name-input')).not.toBeNull()
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(t('panels.rename.refused'))
  })

  it('a blur while the name is being saved keeps the field open, and a refusal puts the cursor back in it', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    let answer: (saved: boolean) => void = () => {}
    const onRename = vi.fn(() => new Promise<boolean>((resolve) => (answer = resolve)))

    act(() => useUIStore.setState({ focus: 'lineage:a' }))
    act(() =>
      root.render(
        <TribeCard
          world={world(['a', 'b'])}
          onAnswer={() => {}}
          onTool={() => {}}
          onRename={onRename}
          onTeach={() => {}}
        />,
      ),
    )
    act(() => host.querySelector<HTMLButtonElement>('.tribe-card-rename')!.click())
    const input = host.querySelector<HTMLInputElement>('.tribe-card-name-input')!
    typeInto(input, 'Ashen')
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    act(() => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    expect(host.querySelector('.tribe-card-name-input')).not.toBeNull()

    await act(async () => answer(false))

    const field = host.querySelector<HTMLInputElement>('.tribe-card-name-input')!
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(t('panels.rename.refused'))
    expect(document.activeElement).toBe(field)
  })

  it('a refusal does not show again once the player reopens the field', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    const onRename = vi.fn(() => Promise.resolve(false))

    act(() => useUIStore.setState({ focus: 'lineage:a' }))
    act(() =>
      root.render(
        <TribeCard
          world={world(['a', 'b'])}
          onAnswer={() => {}}
          onTool={() => {}}
          onRename={onRename}
          onTeach={() => {}}
        />,
      ),
    )
    act(() => host.querySelector<HTMLButtonElement>('.tribe-card-rename')!.click())
    const input = host.querySelector<HTMLInputElement>('.tribe-card-name-input')!
    typeInto(input, 'Ashen')
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    expect(host.querySelector('[role="alert"]')).not.toBeNull()

    act(() => {
      host
        .querySelector<HTMLInputElement>('.tribe-card-name-input')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    act(() => host.querySelector<HTMLButtonElement>('.tribe-card-rename')!.click())

    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('names an enemy tribe that has died out by the name it had while it lived', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    // The enemy was on the snapshot the player saw; the latest one has dropped its name.
    useWorldStore
      .getState()
      .setWorld({ tick: 10, organisms: [], lineage_names: { gone: 'Gonefolk' } } as unknown as WorldState)
    const war = {
      id: 'war-1',
      attackers: ['a'],
      defenders: ['gone'],
      scale: 'raid',
      location: [0, 0],
      started_tick: 5,
      ended: false,
      casualties_a: 0,
      casualties_d: 0,
    }
    const w = { ...world(['a']), battles: [war] } as unknown as WorldState
    act(() => useUIStore.setState({ focus: 'lineage:a' }))
    act(() => root.render(card(w)))

    expect(host.textContent).toContain('Gonefolk')
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

  it('guides a tribe to its next age by the world it needs, not by its own size', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)

    const w = {
      ...world(['a', 'b']),
      lineage_era_progress: [
        {
          lineage_id: 'a',
          era_name: 'stone',
          next_era: 'bronze',
          pop: 1,
          pop_required: 8,
          pop_ready: false,
          world_population: 2,
          world_population_required: 6,
          world_population_ready: false,
          required: ['farming', 'pottery'],
          known: ['pottery'],
          missing: ['farming'],
          discovery_ready: false,
          ready: false,
        },
      ],
    } as unknown as WorldState
    act(() => useUIStore.setState({ focus: 'lineage:a' }))
    act(() => root.render(card(w)))

    expect(host.textContent).toContain(t('panels.tribe.guide.known', { known: '1', required: '2' }))
    expect(host.textContent).toContain(t('panels.tribe.stillToLearn', { list: 'farming' }))
    expect(host.textContent).toContain(
      t('panels.tribe.guide.worldPeople', { have: '2', need: '6', short: '4' }),
    )
  })
})
