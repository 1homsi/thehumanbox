// @vitest-environment happy-dom
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { FallenTribe } from './FallenTribe'
import { TribeCard } from './TribeCard'
import { calendarAt } from '../../game/model/calendar'
import { useCameraFocus } from '../../state/camera-focus'
import { useUIStore } from '../../state/store'
import { useWorldStore } from '../../state/worldStore'
import { t } from '../../i18n'
import type { WorldState } from '../../shared/types'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
const roots: Root[] = []
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
  useCameraFocus.setState({ request: null })
  useUIStore.setState({ focus: 'all' })
})

const world = {
  tick: 9000,
  organisms: [],
  lineage_names: { a: 'Ash', b: 'Bren' },
  tribe_chronicle: {
    a: [
      { tick: 100, kind: 'famine', other: null, word: null, x: 3, y: 4 },
      { tick: 500, kind: 'war', other: 'b', word: null, x: 10, y: 20 },
      { tick: 800, kind: 'extinct', other: null, word: 'starvation', x: 12, y: 15 },
    ],
  },
} as unknown as WorldState

function mount(node: ReactElement): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(node))
  return host
}

describe('FallenTribe', () => {
  it('keeps the card of a tribe that died out, with its end summary tagged by cause and context', () => {
    const host = mount(<FallenTribe world={world} lineage="a" />)
    expect(host.querySelector('.tribe-card-name')?.textContent).toBe('Ash')
    expect(host.textContent).toContain(t('panels.tribe.fallen.diedOut', { year: calendarAt(800).year }))

    const tags = [...host.querySelectorAll('.tribe-end-tag')]
    expect(tags.map((tag) => tag.textContent)).toEqual([
      t('panels.tribe.fallen.causeTag'),
      t('panels.tribe.fallen.contextTag'),
      t('panels.tribe.fallen.contextTag'),
    ])
    expect(tags[0]?.classList.contains('cause')).toBe(true)
    expect(tags[1]?.classList.contains('cause')).toBe(false)
    expect(host.textContent).toContain(t('panels.tribe.fallen.cause', { cause: t('model.loss.hunger') }))
    // The health and food bars belong to a living tribe only.
    expect(host.querySelector('.tribe-need')).toBeNull()
  })

  it('takes the camera to a line with a place, and opens the other tribe for a line without one', () => {
    const host = mount(<FallenTribe world={world} lineage="a" />)
    const go = [...host.querySelectorAll('button.tribe-history-go')] as HTMLButtonElement[]
    // Newest first: the extinction (place 12,15), the war (place 10,20), the famine (place 3,4).
    act(() => go[0]!.click())
    expect(useCameraFocus.getState().request).toMatchObject({ x: 12, y: 15 })
  })

  it('a tribe with no one alive keeps its card through the tribe card', () => {
    useUIStore.setState({ focus: 'lineage:a' })
    const host = mount(
      <TribeCard
        world={world}
        onAnswer={() => {}}
        onTool={() => {}}
        onRename={async () => false}
        onTeach={() => {}}
      />,
    )
    expect(host.querySelector('.tribe-card-fallen')).not.toBeNull()
  })

  it('a tribe that is not in the history gets no card', () => {
    useUIStore.setState({ focus: 'lineage:zzz' })
    const host = mount(
      <TribeCard
        world={world}
        onAnswer={() => {}}
        onTool={() => {}}
        onRename={async () => false}
        onTeach={() => {}}
      />,
    )
    expect(host.querySelector('.tribe-card')).toBeNull()
  })

  it('reads the name a tribe had before it died out', () => {
    useWorldStore
      .getState()
      .setWorld({ tick: 1, organisms: [], lineage_names: { a: 'Hearth' } } as unknown as WorldState)
    useWorldStore
      .getState()
      .setWorld({ tick: 900, organisms: [], lineage_names: {} } as unknown as WorldState)
    const host = mount(
      <FallenTribe world={{ ...world, lineage_names: {} } as unknown as WorldState} lineage="a" />,
    )
    expect(host.querySelector('.tribe-card-name')?.textContent).toBe('Hearth')
  })
})
