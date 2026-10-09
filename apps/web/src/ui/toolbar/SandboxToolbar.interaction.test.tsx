// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SANDBOX_CATEGORIES, type SandboxTool } from '../../simulation/sandbox'
import { DOCK_TABS, SPEED_TOOL_IDS, TIME_CATEGORY_ID, groupsFor } from './dock-tabs'
import { SandboxToolbar } from './SandboxToolbar'

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
    onSave: vi.fn(),
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
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('world dock buttons', () => {
  // One test per tab, so each tab's clicks get their own time budget. Clicking every tab in
  // one test took about 5 s, which timed out whenever the full suite ran in parallel.
  for (const dockTab of DOCK_TABS) {
    it(`shows the ${dockTab.id} tab's tools and picks each one when clicked`, () => {
      const props = render()
      click(tab(dockTab.id))
      expect(tab(dockTab.id)?.getAttribute('aria-pressed')).toBe('true')
      const tools = groupsFor(dockTab.id).flatMap((group) => group.tools)
      expect(container.querySelectorAll('.dock-group .dock-tile')).toHaveLength(tools.length)
      for (const tool of tools) {
        click(tile(tool.label))
        // The dice roll their own event when picked, so they are checked by id.
        if (tool.id === 'dice')
          expect(props.onPick).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'dice' }))
        else expect(props.onPick).toHaveBeenLastCalledWith(tool)
      }
      expect(props.onPick).toHaveBeenCalledTimes(tools.length)
    })
  }

  it('steps the speed one finer step faster or slower from the speed the world runs at', () => {
    const props = render({ runtimeSpeed: 1 })
    click(container.querySelector('[aria-label="faster"]') as HTMLElement)
    expect(props.onPick).toHaveBeenLastCalledWith(
      expect.objectContaining({ time: { control: 'speed', mult: 2 } }),
    )
    click(container.querySelector('[aria-label="slower"]') as HTMLElement)
    expect(props.onPick).toHaveBeenLastCalledWith(
      expect.objectContaining({ time: { control: 'speed', mult: 0.5 } }),
    )
  })

  it('remembers the chosen tab', () => {
    render()
    click(tab('helpful'))
    expect(window.localStorage.getItem('thb-sandbox-category')).toBe('helpful')
    act(() => root.unmount())
    root = createRoot(container)
    render()
    expect(tab('helpful')?.getAttribute('aria-pressed')).toBe('true')
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
    click(tab('maps'))
    expect(tile('borders')?.getAttribute('aria-pressed')).toBe('true')
    expect(tile('people')?.getAttribute('aria-pressed')).toBe('true')
    expect(tile('towns')?.getAttribute('aria-pressed')).toBe('false')
    expect(tab('maps')?.classList.contains('engaged')).toBe(true)
  })

  it('pauses, resumes, and sets every offered speed', () => {
    const props = render({ runtimeSpeed: 2 })
    click(container.querySelector('[aria-label="Pause simulation"]'))
    expect(props.onPick).toHaveBeenLastCalledWith(expect.objectContaining({ time: { control: 'pause' } }))

    const time = SANDBOX_CATEGORIES.find((c) => c.id === TIME_CATEGORY_ID)?.tools ?? []
    for (const id of SPEED_TOOL_IDS) {
      const speed = time.find((t) => t.id === id) as SandboxTool
      click(container.querySelector(`[aria-label="Speed ${speed.label}"]`))
      expect(props.onPick).toHaveBeenLastCalledWith(speed)
    }
    expect(container.querySelector('[aria-label="Speed 2×"]')?.classList.contains('active')).toBe(true)

    render({ ...props, runtimePaused: true })
    click(container.querySelector('[aria-label="Resume simulation"]'))
    expect(props.onPick).toHaveBeenLastCalledWith(expect.objectContaining({ time: { control: 'resume' } }))
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

  it('saves the world and opens tool search', () => {
    const props = render()
    click(container.querySelector('[aria-label="save world"]'))
    expect(props.onSave).toHaveBeenCalledTimes(1)
    click(container.querySelector('[aria-label="Search all world tools"]'))
    expect(document.querySelector('.world-tool-search')).not.toBeNull()
  })

  it('shows tool status messages in the hint line', () => {
    render({ status: 'smite · no one there' })
    expect(container.querySelector('.dock-hint')?.textContent).toContain('smite · no one there')
  })
})
