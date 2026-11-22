// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { REPO_URL } from '../../shared/links'
import { trackEvent } from '../../shared/observability'
import type { SettlementInfo, WorldState } from '../../shared/types'
import { useUIStore } from '../../state/store'
import { TOAST_RETRY_MS } from './screenBusy'
import {
  LEGACY_STAR_PROMPT_KEY,
  STAR_DELAY_MIN_MS,
  STAR_MAX_ASKS,
  STAR_MIN_PLAY_MS,
  STAR_PROMPT_KEY,
  StarToast,
} from './StarToast'

vi.mock('../../shared/observability', () => ({ trackEvent: vi.fn() }))

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
const roots: Array<{ unmount: () => void }> = []
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
function state() {
  const raw = window.localStorage.getItem(STAR_PROMPT_KEY)
  return raw ? JSON.parse(raw) : null
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(trackEvent).mockClear()
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
})
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.useRealTimers()
  const flags = useUIStore.getState().viewFlags
  if (flags.photoMode) useUIStore.getState().setViewFlag('photoMode', false)
})

const TEN_MINUTES_MS = 10 * 60_000

function mount(world: WorldState | null = worldWith()) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(<StarToast world={world} />))
  return (next: WorldState | null) => act(() => root.render(<StarToast world={next} />))
}
const toast = () => document.querySelector('.star-toast')
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
const shownCalls = () => vi.mocked(trackEvent).mock.calls.filter(([name]) => name === 'star_prompt_shown')

function settlement(tier = 1): SettlementInfo {
  return {
    lineage_id: 'lineage-a',
    name: 'Firstfolk',
    tier,
    tier_name: tier >= 1 ? 'camp' : 'wilderness',
    center: [10, 10],
    population: 10,
    building_count: tier >= 1 ? 1 : 0,
    capacity: tier >= 1 ? 4 : 0,
    score: tier >= 1 ? 10 : 0,
  }
}

function worldWith(settlements: SettlementInfo[] = [], tick = 0): WorldState {
  return { tick, settlements } as WorldState
}

const timerHref = `${REPO_URL}?utm_source=thehumanbox&utm_medium=star_toast&utm_campaign=star_prompt_timer`
const momentHref = `${REPO_URL}?utm_source=thehumanbox&utm_medium=star_toast&utm_campaign=star_prompt_first_settlement`

describe('StarToast', () => {
  it('shows one soft nudge after ten minutes in a world and never again once dismissed', () => {
    expect(STAR_MIN_PLAY_MS).toBe(TEN_MINUTES_MS)
    expect(STAR_DELAY_MIN_MS).toBe(TEN_MINUTES_MS)
    expect(STAR_MAX_ASKS).toBe(1)

    const update = mount(null)
    wait(TEN_MINUTES_MS)
    expect(toast()).toBeNull()
    expect(shownCalls()).toHaveLength(0)

    update(worldWith())
    wait(TEN_MINUTES_MS - 1)
    expect(toast()).toBeNull()
    wait(1)
    expect(toast()?.textContent).toContain('Enjoying your world?')
    expect(trackEvent).toHaveBeenCalledWith('star_prompt_shown', {
      trigger: 'timer',
      play_ms: TEN_MINUTES_MS,
      ask_number: 1,
    })

    act(() => (toast()?.querySelector('.desktop-toast-close') as HTMLButtonElement).click())
    expect(toast()).toBeNull()
    expect(state()).toMatchObject({ asks: 1 })
    expect(typeof state().dismissedAt).toBe('number')
    expect(trackEvent).toHaveBeenCalledWith('star_prompt_dismissed', { trigger: 'timer' })

    mount()
    wait(TEN_MINUTES_MS)
    expect(toast()).toBeNull()
    expect(shownCalls()).toHaveLength(1)
  })

  it('holds a first settlement until ten minutes, then asks once', () => {
    const update = mount(worldWith())
    update(worldWith([settlement()], 600))
    wait(TEN_MINUTES_MS - 1)
    expect(toast()).toBeNull()
    expect(shownCalls()).toHaveLength(0)
    wait(1)
    expect(toast()?.textContent).toContain('Your first settlement!')
    expect(shownCalls()).toHaveLength(1)
    expect(shownCalls()[0]?.[1]).toMatchObject({ trigger: 'first_settlement', play_ms: TEN_MINUTES_MS })
  })

  it('uses the timer as a fallback and links to the tagged repository URL', () => {
    mount()
    wait(STAR_DELAY_MIN_MS - 1)
    expect(toast()).toBeNull()
    wait(1)
    expect(toast()).not.toBeNull()
    expect(toast()?.querySelector('a')?.getAttribute('href')).toBe(timerHref)
    expect(state().asks).toBe(1)
    expect(trackEvent).toHaveBeenCalledWith('star_prompt_shown', {
      trigger: 'timer',
      play_ms: STAR_DELAY_MIN_MS,
      ask_number: 1,
    })
  })

  it('shows at the first settlement and records the moment trigger', () => {
    const update = mount(worldWith())
    update(worldWith([settlement()], 600))
    wait(STAR_MIN_PLAY_MS - 1)
    expect(toast()).toBeNull()
    wait(1)
    expect(toast()).not.toBeNull()
    expect(toast()?.textContent).toContain('Your first settlement!')
    expect(toast()?.querySelector('a')?.getAttribute('href')).toBe(momentHref)
    expect(trackEvent).toHaveBeenCalledWith('star_prompt_shown', {
      trigger: 'first_settlement',
      play_ms: STAR_MIN_PLAY_MS,
      ask_number: 1,
    })
    const link = toast()?.querySelector('a') as HTMLAnchorElement
    link.addEventListener('click', (event) => event.preventDefault())
    act(() => link.click())
    expect(trackEvent).toHaveBeenCalledWith('star_prompt_clicked', { trigger: 'first_settlement' })
  })

  it('holds an early settlement until the minimum play time', () => {
    const update = mount(worldWith())
    update(worldWith([settlement()], 600))
    wait(STAR_MIN_PLAY_MS - 1)
    expect(toast()).toBeNull()
    expect(shownCalls()).toHaveLength(0)
    wait(1)
    expect(toast()).not.toBeNull()
    expect(shownCalls()[0]?.[1]).toMatchObject({ trigger: 'first_settlement', play_ms: STAR_MIN_PLAY_MS })
  })

  it('does not mistake a settlement already in a loaded world for a new moment', () => {
    const update = mount(worldWith([settlement()], 4_000))
    update(worldWith([settlement()], 4_100))
    wait(STAR_DELAY_MIN_MS - 1)
    expect(toast()).toBeNull()
    expect(shownCalls()).toHaveLength(0)
    wait(1)
    expect(shownCalls()[0]?.[1]).toMatchObject({ trigger: 'timer' })
  })

  it('shows at most once when more moments and the fallback arrive', () => {
    const update = mount(worldWith())
    wait(STAR_MIN_PLAY_MS)
    update(worldWith([settlement()], 600))
    expect(toast()).not.toBeNull()
    update(worldWith([settlement(), { ...settlement(), lineage_id: 'lineage-b' }], 1_200))
    wait(STAR_DELAY_MIN_MS * 2)
    expect(shownCalls()).toHaveLength(1)
    expect(state().asks).toBe(1)
  })

  it('keeps the timer as the winner when it becomes due before the moment', () => {
    const update = mount(worldWith())
    wait(STAR_DELAY_MIN_MS)
    expect(toast()).not.toBeNull()
    update(worldWith([settlement()], 600))
    expect(shownCalls()).toHaveLength(1)
    expect(shownCalls()[0]?.[1]).toMatchObject({ trigger: 'timer' })
  })

  it('stays away while a dismissal is still in its cooldown', () => {
    window.localStorage.setItem(STAR_PROMPT_KEY, JSON.stringify({ asks: 1, dismissedAt: Date.now() }))
    mount()
    wait(STAR_DELAY_MIN_MS * 4)
    expect(toast()).toBeNull()
  })

  it('stays away once it has run out of asks', () => {
    window.localStorage.setItem(STAR_PROMPT_KEY, JSON.stringify({ asks: STAR_MAX_ASKS, dismissedAt: 0 }))
    mount()
    wait(STAR_DELAY_MIN_MS * 4)
    expect(toast()).toBeNull()
  })

  it('never asks again after a dismissal, and never again once starred', () => {
    window.localStorage.setItem(STAR_PROMPT_KEY, JSON.stringify({ asks: 1, dismissedAt: 0 }))
    mount()
    wait(STAR_DELAY_MIN_MS * 4)
    expect(toast()).toBeNull()
    expect(shownCalls()).toHaveLength(0)
    expect(state().asks).toBe(1)

    window.localStorage.setItem(STAR_PROMPT_KEY, JSON.stringify({ asks: 1, starred: true, dismissedAt: 0 }))
    mount()
    wait(STAR_DELAY_MIN_MS * 4)
    expect(toast()).toBeNull()
  })

  it('carries over a v1 star and a v1 dismissal', () => {
    window.localStorage.setItem(LEGACY_STAR_PROMPT_KEY, 'starred')
    mount()
    wait(STAR_DELAY_MIN_MS * 4)
    expect(toast()).toBeNull()
    expect(state().starred).toBe(true)

    window.localStorage.clear()
    window.localStorage.setItem(LEGACY_STAR_PROMPT_KEY, 'dismissed')
    mount()
    wait(STAR_DELAY_MIN_MS * 4)
    expect(toast()).toBeNull()
    expect(shownCalls()).toHaveLength(0)
    expect(state()).toMatchObject({ asks: 1 })
    expect(typeof state().dismissedAt).toBe('number')
  })

  it('keeps a star recorded in another tab when the stale toast is dismissed', () => {
    mount()
    wait(STAR_DELAY_MIN_MS)
    expect(toast()).not.toBeNull()
    window.localStorage.setItem(STAR_PROMPT_KEY, JSON.stringify({ asks: 1, starred: true }))
    act(() => (toast()?.querySelector('.desktop-toast-secondary') as HTMLButtonElement).click())
    expect(toast()).toBeNull()
    expect(state()).toMatchObject({ asks: 1, starred: true })
    mount()
    wait(STAR_DELAY_MIN_MS * 4)
    expect(toast()).toBeNull()
  })

  it('carries over a v1 star that appears after v2 state exists', () => {
    window.localStorage.setItem(STAR_PROMPT_KEY, JSON.stringify({ asks: 1, dismissedAt: Date.now() }))
    window.localStorage.setItem(LEGACY_STAR_PROMPT_KEY, 'starred')
    mount()
    wait(STAR_DELAY_MIN_MS * 4)
    expect(toast()).toBeNull()
    expect(state()).toMatchObject({ asks: 1, starred: true })
  })

  it('stays hidden when recording an ask fails', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    mount()
    wait(STAR_DELAY_MIN_MS * 4)
    expect(toast()).toBeNull()
  })

  it('stays hidden when storage is unavailable instead of asking every visit', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked')
      },
    })
    mount()
    wait(STAR_DELAY_MIN_MS * 4)
    expect(toast()).toBeNull()
  })

  it('waits behind the welcome card and photo mode instead of stacking on them', () => {
    const welcome = document.createElement('div')
    welcome.className = 'welcome-modal'
    document.body.append(welcome)
    mount()
    wait(STAR_DELAY_MIN_MS + TOAST_RETRY_MS * 3)
    expect(toast()).toBeNull()
    welcome.remove()
    act(() => useUIStore.getState().setViewFlag('photoMode', true))
    wait(TOAST_RETRY_MS * 2)
    expect(toast()).toBeNull()
    act(() => useUIStore.getState().setViewFlag('photoMode', false))
    wait(TOAST_RETRY_MS)
    expect(toast()).not.toBeNull()
  })

  it('remembers whether the player starred or dismissed it and tags both outcomes', () => {
    mount()
    wait(STAR_DELAY_MIN_MS)
    act(() => (toast()?.querySelector('.desktop-toast-secondary') as HTMLButtonElement).click())
    expect(toast()).toBeNull()
    expect(state()).toMatchObject({ asks: 1 })
    expect(typeof state().dismissedAt).toBe('number')
    expect(trackEvent).toHaveBeenCalledWith('star_prompt_dismissed', { trigger: 'timer' })

    window.localStorage.removeItem(STAR_PROMPT_KEY)
    mount()
    wait(STAR_DELAY_MIN_MS)
    const link = toast()?.querySelector('a') as HTMLAnchorElement
    link.addEventListener('click', (e) => e.preventDefault())
    act(() => link.click())
    expect(toast()).toBeNull()
    expect(state().starred).toBe(true)
    expect(trackEvent).toHaveBeenCalledWith('star_prompt_clicked', { trigger: 'timer' })

    mount()
    wait(STAR_DELAY_MIN_MS * 4)
    expect(toast()).toBeNull()
  })
})
