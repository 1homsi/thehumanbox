// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUIStore } from '../../state/store'
import { MoreDropdown } from './MoreDropdown'
import { worldActionForKey, type WorldActions, type WorldSave } from './world-actions'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

const save = (over: Partial<WorldSave> = {}): WorldSave => ({
  onSave: vi.fn(),
  busy: false,
  error: false,
  retryable: false,
  ...over,
})
function render(worldActions?: WorldActions) {
  act(() => root.render(<MoreDropdown worldActions={worldActions} />))
}
const actions = () => [...container.querySelectorAll<HTMLButtonElement>('.more-dropdown-action')]
const item = (text: string) => actions().find((b) => b.textContent?.includes(text))

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  useUIStore.setState({ showMore: true })
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('the ⋯ menu', () => {
  it('starts with find a tool and save world', () => {
    render({ findTool: vi.fn(), save: save() })
    expect(actions().map((b) => b.querySelector('span')?.textContent)).toEqual([
      '⌕ Find a tool…',
      'Save world',
    ])
    expect(container.querySelector('.more-dropdown')?.firstElementChild?.className).toBe(
      'more-dropdown-actions',
    )
    expect(item('Find a tool')?.querySelector('kbd')?.textContent).toBe('/')
  })

  it('opens the tool search and closes the menu', () => {
    const findTool = vi.fn()
    render({ findTool })
    act(() => item('Find a tool')!.click())
    expect(findTool).toHaveBeenCalledTimes(1)
    expect(useUIStore.getState().showMore).toBe(false)
  })

  it('saves, and shows how the save went in the item', () => {
    const world = save({ status: 'saved locally · tick 24,000' })
    render({ save: world })
    act(() => item('Save world')!.click())
    expect(world.onSave).toHaveBeenCalledTimes(1)
    expect(item('Save world')?.textContent).toContain('saved locally · tick 24,000')
  })

  it('says saving while a save runs, and blocks a second one', () => {
    render({ save: save({ busy: true, status: 'saving tick 9…' }) })
    const busy = item('Saving…')
    expect(busy?.disabled).toBe(true)
    expect(busy?.getAttribute('aria-busy')).toBe('true')
    expect(busy?.textContent).toContain('saving tick 9…')
  })

  it('offers a retry after a failed save that can be retried', () => {
    render({ save: save({ error: true, retryable: true, status: 'temporary storage failure' }) })
    const retry = item('↻ Retry save')
    expect(retry?.disabled).toBe(false)
    expect(retry?.classList.contains('error')).toBe(true)
    expect(retry?.textContent).toContain('temporary storage failure')
  })

  it('blocks saving after a failure that cannot be retried', () => {
    render({ save: save({ error: true, retryable: false, status: 'another tab owns this world' }) })
    expect(item('Save world')?.disabled).toBe(true)
  })

  it('leaves both out when the world has neither', () => {
    render()
    expect(actions()).toHaveLength(0)
    expect(container.querySelector('.more-dropdown')?.firstElementChild?.className).toBe(
      'more-dropdown-section',
    )
  })
})

describe('the find and save keys', () => {
  const field = document.createElement('input')
  it('saves on ⌘S or Ctrl+S, even from a field, but not ⌘⇧S', () => {
    expect(worldActionForKey({ key: 's', metaKey: true, target: null })).toBe('save')
    expect(worldActionForKey({ key: 's', ctrlKey: true, target: field })).toBe('save')
    expect(worldActionForKey({ key: 'S', metaKey: true, shiftKey: true, target: null })).toBeNull()
    expect(worldActionForKey({ key: 's', target: null })).toBeNull()
  })

  it('finds a tool on /, unless the player is typing', () => {
    expect(worldActionForKey({ key: '/', target: document.body })).toBe('find')
    expect(worldActionForKey({ key: '/', target: field })).toBeNull()
    expect(worldActionForKey({ key: '/', metaKey: true, target: null })).toBeNull()
  })
})
