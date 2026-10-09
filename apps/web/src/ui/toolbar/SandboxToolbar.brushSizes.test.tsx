// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BRUSH_SIZES } from './dock-tabs'
import { SandboxToolbar } from './SandboxToolbar'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type ToolbarProps = Parameters<typeof SandboxToolbar>[0]

let container: HTMLDivElement
let root: Root

function render(overrides: Partial<ToolbarProps> = {}) {
  const props: ToolbarProps = {
    armedToolId: 'grass',
    brush: 0,
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

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

// The dock's first tab (life, with every animal) builds many sprites in happy-dom on first render.
describe('brush size presets', { timeout: 20_000 }, () => {
  it('offers the sizes 1, 2, 3 and 5 while a tool is armed', () => {
    render()
    expect(BRUSH_SIZES.map(([size]) => size)).toEqual([1, 2, 3, 5])
    for (const [size] of BRUSH_SIZES) {
      expect(container.querySelector(`[aria-label="Brush size ${size}"]`), `size ${size}`).not.toBeNull()
    }
  })

  it('sets the brush to the matching radius when a size is picked', () => {
    const props = render({ brush: 0 })
    click(container.querySelector('[aria-label="Brush size 5"]'))
    expect(props.onBrush).toHaveBeenLastCalledWith(4)
    click(container.querySelector('[aria-label="Brush size 1"]'))
    expect(props.onBrush).toHaveBeenLastCalledWith(0)
  })

  it('marks the size that matches the current brush as pressed', () => {
    render({ brush: 2 })
    expect(container.querySelector('[aria-label="Brush size 3"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('[aria-label="Brush size 2"]')?.getAttribute('aria-pressed')).toBe('false')
  })

  it('hides the presets when no tool is armed', () => {
    render({ armedToolId: null })
    expect(container.querySelector('[aria-label="Brush size 5"]')).toBeNull()
  })
})
