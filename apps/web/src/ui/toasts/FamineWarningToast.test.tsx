// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { FamineWarningToast } from './FamineWarningToast'
import { useCameraFocus } from '../../state/camera-focus'
import { useUIStore } from '../../state/store'
import { useTribeFollow } from '../../state/tribe-follow'
import { useWorldReplaced } from '../../state/world-replaced'
import { t } from '../../i18n'
import type { WorldState } from '../../shared/types'

const seed = vi.hoisted(() => ({ current: 'one' }))
vi.mock('../../simulation/worldSource', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../simulation/worldSource')>()),
  getOwnWorldSeed: () => seed.current,
}))

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
const roots: Root[] = []
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
  useCameraFocus.setState({ request: null })
  useUIStore.setState({ focus: 'all' })
  useTribeFollow.setState({ followed: [], warnFollowedOnly: false })
  seed.current = 'one'
})

/** A world where tribe `a` has the given average food, with its home at (5, 6). */
function world(tick: number, food: number): WorldState {
  return {
    tick,
    grid: { width: 64, height: 64, origin_x: 0, origin_y: 0 },
    lineage_names: { a: 'Ash' },
    organisms: [
      { id: '1', alive: true, lineage_id: 'a', energy: food, x: 5, y: 6 },
      { id: '2', alive: true, lineage_id: 'a', energy: food, x: 5, y: 6 },
    ],
    settlements: [{ lineage_id: 'a', center: [5, 6] }],
    tribes_in_peril: [],
    tribe_losses: {},
    tribe_chronicle: {},
  } as unknown as WorldState
}

function mount(w: WorldState): { host: HTMLElement; rerender: (next: WorldState | null) => void } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(<FamineWarningToast world={w} />))
  return { host, rerender: (next) => act(() => root.render(<FamineWarningToast world={next} />)) }
}

describe('FamineWarningToast', () => {
  it('does not warn about a tribe that is already hungry when the game is first looked at', () => {
    const { host } = mount(world(100, 0.1))
    expect(host.querySelector('.famine-toast')).toBeNull()
  })

  it('warns when a tribe first reaches a famine stage, and a click takes the camera to its home', () => {
    const { host, rerender } = mount(world(100, 0.8))
    rerender(world(200, 0.1))
    const toast = host.querySelector('.famine-toast')
    expect(toast?.textContent).toContain(t('panels.famine.risk', { name: 'Ash' }))
    expect(toast?.classList.contains('famine-risk')).toBe(true)

    act(() => (host.querySelector('.famine-toast-go') as HTMLButtonElement).click())
    expect(useUIStore.getState().focus).toBe('lineage:a')
    expect(useCameraFocus.getState().request).toMatchObject({ x: 5, y: 6 })
    expect(host.querySelector('.famine-toast')).toBeNull()
  })

  it('with warnings limited to followed tribes, an unfollowed tribe gets no warning', () => {
    useTribeFollow.setState({ followed: [], warnFollowedOnly: true })
    const { host, rerender } = mount(world(100, 0.8))
    rerender(world(200, 0.1))
    expect(host.querySelector('.famine-toast')).toBeNull()
  })

  it('with warnings limited to followed tribes, a followed tribe still gets its warning', () => {
    useTribeFollow.setState({ followed: ['a'], warnFollowedOnly: true })
    const { host, rerender } = mount(world(100, 0.8))
    rerender(world(200, 0.1))
    expect(host.querySelector('.famine-toast')?.textContent).toContain(
      t('panels.famine.risk', { name: 'Ash' }),
    )
  })

  it('a warning still waiting is dropped when the world goes away, and the next world is only learned', () => {
    const { host, rerender } = mount(world(100, 0.8))
    rerender(world(200, 0.1))
    expect(host.querySelector('.famine-toast')).not.toBeNull()
    rerender(null)
    expect(host.querySelector('.famine-toast')).toBeNull()
    rerender(world(300, 0.1))
    expect(host.querySelector('.famine-toast')).toBeNull()
  })

  it('a different world at a later tick starts the watch over instead of warning about what was already true', () => {
    const { host, rerender } = mount(world(100, 0.8))
    seed.current = 'two'
    rerender(world(500, 0.1))
    expect(host.querySelector('.famine-toast')).toBeNull()
  })

  it('a warning still waiting is dropped when the tick goes back, as when a save loads', () => {
    const { host, rerender } = mount(world(100, 0.8))
    rerender(world(200, 0.1))
    rerender(world(50, 0.1))
    expect(host.querySelector('.famine-toast')).toBeNull()
  })

  it('a world swapped in mid-session drops the waiting warning and is only learned, not warned about', () => {
    const { host, rerender } = mount(world(100, 0.8))
    rerender(world(200, 0.1))
    expect(host.querySelector('.famine-toast')).not.toBeNull()
    act(() => useWorldReplaced.getState().bump())
    expect(host.querySelector('.famine-toast')).toBeNull()
    // Same seed, a later tick, already hungry: the restored world is learned, not announced.
    rerender(world(300, 0.1))
    expect(host.querySelector('.famine-toast')).toBeNull()
  })

  it('limiting warnings to followed tribes drops a waiting warning for a tribe not followed', () => {
    const { host, rerender } = mount(world(100, 0.8))
    rerender(world(200, 0.1))
    expect(host.querySelector('.famine-toast')).not.toBeNull()
    act(() => useTribeFollow.setState({ followed: [], warnFollowedOnly: true }))
    expect(host.querySelector('.famine-toast')).toBeNull()
  })

  it('a swap and its first frame arriving together learn that frame, so the next drop into famine still warns', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    roots.push(root)
    act(() => root.render(<FamineWarningToast world={world(100, 0.8)} />))
    act(() => {
      useWorldReplaced.getState().bump()
      root.render(<FamineWarningToast world={world(200, 0.8)} />)
    })
    act(() => root.render(<FamineWarningToast world={world(300, 0.1)} />))
    expect(host.querySelector('.famine-toast')?.textContent).toContain(
      t('panels.famine.risk', { name: 'Ash' }),
    )
  })
})
