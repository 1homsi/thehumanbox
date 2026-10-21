// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SANDBOX_CATEGORIES, type SandboxTool } from '../../simulation/sandbox'
import { DOCK_TABS, groupLabel, groupsFor } from './dock-tabs'
import { SandboxToolbar } from './SandboxToolbar'
import { useWorldStore } from '../../state/worldStore'
import type { WorldState } from '../../shared/types'

// Every button in the world dock, clicked through the real component.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type ToolbarProps = Parameters<typeof SandboxToolbar>[0]

let container: HTMLDivElement
let root: Root

function render(overrides: Partial<ToolbarProps> = {}) {
  const props: ToolbarProps = {
    armedToolId: null,
    brush: 2,
    onBrush: vi.fn(),
    onPick: vi.fn(),
    onClearArmed: vi.fn(),
    ...overrides,
  }
  act(() => root.render(<SandboxToolbar {...props} />))
  return props
}

const click = (el: Element | null) => {
  if (!el) throw new Error('missing element')
  act(() => (el as HTMLElement).click())
}
const tab = (id: string) =>
  container.querySelector(`.dock-tab:nth-child(${DOCK_TABS.findIndex((t) => t.id === id) + 1})`)
const tile = (label: string) => container.querySelector(`.dock-tile[aria-label="${label}"]`)
const chip = (label: string) =>
  [...container.querySelectorAll<HTMLElement>('.dock-group-chip')].find((c) => c.textContent === label) ??
  null
const key = (k: string, init: KeyboardEventInit = {}) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }))
  })

// Recent Node versions shadow happy-dom's storage, so give the dock a
// plain in-memory one to remember its tab in.
function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  useWorldStore.setState({ world: { grid: { width: 800, height: 400 } } as WorldState })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  useWorldStore.setState({ world: null })
  vi.restoreAllMocks()
})

// Every test renders the dock, whose first tab (life, with every animal) builds many sprites in
// happy-dom; the default 5 s budget is too little on a loaded machine.
describe('world dock buttons', { timeout: 20_000 }, () => {
  // One test per tab, so each tab's clicks get their own time budget. Clicking every tab in
  // one test took about 5 s, which timed out whenever the full suite ran in parallel. Most of
  // a tab's time is the first render (happy-dom building every sprite's rects), so the budget
  // is explicit: the default 5 s is too little on a loaded machine.
  for (const dockTab of DOCK_TABS) {
    it(`shows the ${dockTab.id} tab's tools and picks each one when clicked`, () => {
      const props = render()
      click(tab(dockTab.id))
      expect(tab(dockTab.id)?.getAttribute('aria-pressed')).toBe('true')
      const groups = groupsFor(dockTab.id)
      // A tab with one group needs no chips; its tools are on the row straight away.
      expect(container.querySelectorAll('.dock-group-chip')).toHaveLength(
        groups.length > 1 ? groups.length : 0,
      )
      const tools = groups.flatMap((group) => group.tools)
      for (const group of groups) {
        if (groups.length > 1) click(chip(groupLabel(group)))
        expect(container.querySelectorAll('.dock-tools .dock-tile')).toHaveLength(group.tools.length)
        for (const tool of group.tools) {
          click(tile(tool.label))
          // The dice roll their own event when picked, so they are checked by id.
          if (tool.id === 'dice')
            expect(props.onPick).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'dice' }))
          else expect(props.onPick).toHaveBeenLastCalledWith(tool)
        }
      }
      expect(props.onPick).toHaveBeenCalledTimes(tools.length)
    }, 20_000)
  }

  it('rolls events using the loaded world dimensions', () => {
    const props = render()
    click(tab('nature'))
    click(chip('sky'))
    vi.spyOn(Math, 'random').mockReturnValue(0.99).mockReturnValueOnce(0.2)
    click(tile('dice'))
    expect(props.onPick).toHaveBeenLastCalledWith(
      expect.objectContaining({ fire: expect.objectContaining({ x: 792, y: 396 }) }),
    )
  })

  it('waits for a world before rolling a random event', () => {
    useWorldStore.setState({ world: null })
    const props = render()
    click(tab('nature'))
    click(chip('sky'))
    click(tile('dice'))
    expect(props.onPick).not.toHaveBeenCalled()
  })

  it('remembers the chosen tab', () => {
    render()
    click(tab('resources'))
    expect(window.localStorage.getItem('thb-sandbox-category')).toBe('resources')
    act(() => root.unmount())
    root = createRoot(container)
    render()
    expect(tab('resources')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('opens a category on its first group and switches groups with the chips', () => {
    render()
    expect(chip('people')?.getAttribute('aria-pressed')).toBe('true')
    expect(tile('wolf')).toBeNull()
    click(chip('animals'))
    expect(chip('animals')?.getAttribute('aria-pressed')).toBe('true')
    expect(chip('people')?.getAttribute('aria-pressed')).toBe('false')
    expect(tile('wolf')).not.toBeNull()
    expect(tile('person')).toBeNull()
  })

  it('remembers the last group of each category, across categories and reloads', () => {
    render()
    click(chip('animals'))
    click(tab('nature'))
    click(chip('sky'))
    click(tab('life'))
    expect(chip('animals')?.getAttribute('aria-pressed')).toBe('true')
    click(tab('nature'))
    expect(chip('sky')?.getAttribute('aria-pressed')).toBe('true')
    act(() => root.unmount())
    root = createRoot(container)
    render()
    expect(tab('nature')?.getAttribute('aria-pressed')).toBe('true')
    expect(chip('sky')?.getAttribute('aria-pressed')).toBe('true')
    click(tab('life'))
    expect(chip('animals')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('falls back to the first group when the remembered one is gone', () => {
    window.localStorage.setItem('thb-sandbox-groups', JSON.stringify({ life: 'retired-group' }))
    render()
    expect(chip('people')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('names the held tool above the bar', () => {
    render({ armedToolId: 'wolf', armedToolLabel: 'wolf' })
    expect(container.querySelector('.dock-held')?.textContent).toBe('wolf · click the map')
    render({ armedToolId: null })
    expect(container.querySelector('.dock-held')).toBeNull()
  })

  it('gives the hotkeys to the first ten tools on the row', () => {
    const props = render()
    click(chip('animals'))
    const animals = groupsFor('life').find((g) => g.id === 'animals')!.tools
    expect(tile(animals[0].label)?.getAttribute('aria-keyshortcuts')).toBe('Q')
    key('e')
    expect(props.onPick).toHaveBeenLastCalledWith(animals[1])
  })

  it('marks a group that holds a new tool until the group is opened', () => {
    render()
    const birds = chip('birds')
    expect(birds?.querySelector('.dock-new')).not.toBeNull()
    click(birds)
    expect(chip('birds')?.querySelector('.dock-new')).toBeNull()
  })

  it('puts an armed tool away when its tile is clicked again', () => {
    const person = SANDBOX_CATEGORIES.flatMap((c) => c.tools).find((t) => t.id === 'spawn1') as SandboxTool
    const props = render({ armedToolId: 'spawn1', armedToolLabel: 'person' })
    expect(tile('person')?.getAttribute('aria-pressed')).toBe('true')
    expect(tab('life')?.classList.contains('engaged')).toBe(true)
    click(tile('person'))
    expect(props.onClearArmed).toHaveBeenCalledTimes(1)
    expect(props.onPick).not.toHaveBeenCalledWith(person)
  })

  it('marks active map layers on their tiles and tab', () => {
    render({ activeOverlay: 'density', activeViewFlags: { territory: true } })
    click(tab('world'))
    expect(chip('maps')?.classList.contains('engaged')).toBe(true)
    click(chip('maps'))
    expect(tile('borders')?.getAttribute('aria-pressed')).toBe('true')
    expect(tile('people')?.getAttribute('aria-pressed')).toBe('true')
    expect(tile('towns')?.getAttribute('aria-pressed')).toBe('false')
    expect(tab('world')?.classList.contains('engaged')).toBe(true)
  })

  it('changes brush size within bounds while a tool is armed', () => {
    const props = render({ armedToolId: 'fire', brush: 0 })
    click(container.querySelector('[aria-label="Larger brush"]'))
    expect(props.onBrush).toHaveBeenLastCalledWith(1)
    click(container.querySelector('[aria-label="Smaller brush"]'))
    expect(props.onBrush).toHaveBeenLastCalledWith(0)
    render({ ...props, brush: 20 })
    click(container.querySelector('[aria-label="Larger brush"]'))
    expect(props.onBrush).toHaveBeenLastCalledWith(20)
  })

  it('hides brush controls when no tool is armed', () => {
    render()
    expect(container.querySelector('[aria-label="Larger brush"]')).toBeNull()
  })

  it('has no save or search buttons of its own, now that both are in the ⋯ menu', () => {
    render()
    expect(container.querySelector('[aria-label="save world"]')).toBeNull()
    expect(container.querySelector('[aria-label="Search all world tools"]')).toBeNull()
  })

  it('shows tool status messages in the hint line', () => {
    render({ status: 'smite · no one there' })
    expect(container.querySelector('.dock-hint')?.textContent).toContain('smite · no one there')
  })
})
