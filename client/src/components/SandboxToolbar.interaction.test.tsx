// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SANDBOX_CATEGORIES, type SandboxTool } from '../simulation/sandbox'
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
const tab = (id: string) => container.querySelector(`.dock-tab:nth-child(${DOCK_TABS.findIndex((t) => t.id === id) + 1})`)
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
  it('shows each tab’s tools and picks every tool when clicked', () => {
    const props = render()
    for (const dockTab of DOCK_TABS) {
      click(tab(dockTab.id))
      expect(tab(dockTab.id)?.getAttribute('aria-pressed')).toBe('true')
      const tools = groupsFor(dockTab.id).flatMap((group) => group.tools)
      expect(container.querySelectorAll('.dock-tile')).toHaveLength(tools.length)
      for (const tool of tools) {
        click(tile(tool.label))
        expect(props.onPick).toHaveBeenLastCalledWith(tool)
      }
    }
    const allDockTools = DOCK_TABS.flatMap((t) => groupsFor(t.id)).flatMap((g) => g.tools)
    expect(props.onPick).toHaveBeenCalledTimes(allDockTools.length)
  })

  it('remembers the chosen tab', () => {
    render()
    click(tab('powers'))
    expect(window.localStorage.getItem('thb-sandbox-category')).toBe('powers')
    act(() => root.unmount())
    root = createRoot(container)
    render()
    expect(tab('powers')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('puts an armed tool away when its tile is clicked again', () => {
    const smite = SANDBOX_CATEGORIES.flatMap((c) => c.tools).find((t) => t.id === 'smite') as SandboxTool
    const props = render({ armedToolId: 'smite', armedToolLabel: 'smite' })
    expect(tile('smite')?.getAttribute('aria-pressed')).toBe('true')
    expect(tab('life')?.classList.contains('engaged')).toBe(true)
    click(tile('smite'))
    expect(props.onClearArmed).toHaveBeenCalledTimes(1)
    expect(props.onPick).not.toHaveBeenCalledWith(smite)
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
