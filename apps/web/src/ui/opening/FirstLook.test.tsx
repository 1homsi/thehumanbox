// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { FIRST_LOOK_ZOOM, FirstLook } from './FirstLook'
import { useCameraFocus } from '../../state/camera-focus'
import { readSavedCamera } from '../../game/model/saved-camera'
import type { WorldState } from '../../shared/types'

vi.mock('../../game/model/saved-camera', () => ({ readSavedCamera: vi.fn(() => null) }))

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
const roots: Root[] = []
beforeEach(() => {
  useCameraFocus.setState({ request: null })
  vi.mocked(readSavedCamera).mockReturnValue(null)
})
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
})

function person(id: string, lineage: string, x: number, y: number) {
  return { id, lineage_id: lineage, alive: true, x, y }
}

const world = {
  grid: { width: 800, height: 400 },
  organisms: [person('1', 'a', 1, 1), person('2', 'b', 20, 30), person('3', 'b', 22, 30)],
  settlements: [],
} as unknown as WorldState

function render(w: WorldState | null) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(<FirstLook world={w} />))
  return (next: WorldState | null) => act(() => root.render(<FirstLook world={next} />))
}

describe('first look', () => {
  it('opens close on the largest tribe when there is no saved camera', () => {
    render(world)
    expect(useCameraFocus.getState().request).toMatchObject({ x: 21, y: 30, zoom: FIRST_LOOK_ZOOM })
  })

  it('opens on people about to meet instead of the largest tribe', () => {
    render({
      grid: { width: 800, height: 400 },
      organisms: [
        person('1', 'a', 0, 0),
        person('2', 'a', 40, 0),
        person('3', 'a', 80, 0),
        person('4', 'b', 10, 0),
      ],
      settlements: [],
    } as unknown as WorldState)
    expect(useCameraFocus.getState().request).toMatchObject({ x: 5, y: 0, zoom: FIRST_LOOK_ZOOM })
  })

  it('waits for people, then looks once', () => {
    const rerender = render({ ...world, organisms: [] } as WorldState)
    expect(useCameraFocus.getState().request).toBeNull()
    rerender(world)
    expect(useCameraFocus.getState().request).toMatchObject({ x: 21, y: 30 })
    useCameraFocus.setState({ request: null })
    rerender({ ...world })
    expect(useCameraFocus.getState().request).toBeNull()
  })

  it('leaves a returning player where they left the camera', () => {
    vi.mocked(readSavedCamera).mockReturnValue({ x: 1, y: 1, zoom: 2 })
    render(world)
    expect(useCameraFocus.getState().request).toBeNull()
    vi.mocked(readSavedCamera).mockReturnValue({ x: 9, y: 9, zoom: 2 })
    render({
      grid: { width: 800, height: 400 },
      organisms: [person('1', 'a', 0, 0), person('4', 'b', 10, 0)],
      settlements: [],
    } as unknown as WorldState)
    expect(useCameraFocus.getState().request).toBeNull()
  })
})
