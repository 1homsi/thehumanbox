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
import type { WorldStartMode } from '../../simulation/worldStart'

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

const FIVE_MINUTES_MS = 5 * 60_000
const THREE_MINUTES_MS = 3 * 60_000

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

function worldWith(
  settlements: SettlementInfo[] = [],
  tick = 0,
  extra: Partial<WorldState> = {},
): WorldState {
  return { tick, settlements, ...extra } as WorldState
}

function mountAs(startMode: WorldStartMode, world: WorldState) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(<StarToast world={world} startMode={startMode} />))
  return (next: WorldState) => act(() => root.render(<StarToast world={next} startMode={startMode} />))
}

const tribe = (lineage_id: string, tier = 1): SettlementInfo => ({ ...settlement(tier), lineage_id })

const timerHref = `${REPO_URL}?utm_source=thehumanbox&utm_medium=star_toast&utm_campaign=star_prompt_timer`
const momentHref = `${REPO_URL}?utm_source=thehumanbox&utm_medium=star_toast&utm_campaign=star_prompt_first_settlement`

describe('StarToast', () => {
  it('shows one soft nudge after five minutes in a world and never again once dismissed', () => {
    expect(STAR_MIN_PLAY_MS).toBe(THREE_MINUTES_MS)
    expect(STAR_DELAY_MIN_MS).toBe(FIVE_MINUTES_MS)
    expect(STAR_MAX_ASKS).toBe(1)

    const update = mount(null)
    wait(FIVE_MINUTES_MS)
    expect(toast()).toBeNull()
    expect(shownCalls()).toHaveLength(0)

    update(worldWith())
    wait(FIVE_MINUTES_MS - 1)
    expect(toast()).toBeNull()
    wait(1)
    expect(toast()?.textContent).toContain('Enjoying your world?')
    expect(trackEvent).toHaveBeenCalledWith('star_prompt_shown', {
      trigger: 'timer',
      play_ms: FIVE_MINUTES_MS,
      ask_number: 1,
    })

    act(() => (toast()?.querySelector('.desktop-toast-close') as HTMLButtonElement).click())
    expect(toast()).toBeNull()
    expect(state()).toMatchObject({ asks: 1 })
    expect(typeof state().dismissedAt).toBe('number')
    expect(trackEvent).toHaveBeenCalledWith('star_prompt_dismissed', { trigger: 'timer' })

    mount()
    wait(FIVE_MINUTES_MS)
    expect(toast()).toBeNull()
    expect(shownCalls()).toHaveLength(1)
  })

  it('asks at a first settlement after three minutes, before the five-minute timer', () => {
    const update = mount(worldWith())
    update(worldWith([settlement()], 600))
    wait(STAR_MIN_PLAY_MS - 1)
    expect(toast()).toBeNull()
    expect(shownCalls()).toHaveLength(0)
    wait(1)
    expect(toast()?.textContent).toContain('Your first settlement!')
    expect(shownCalls()).toHaveLength(1)
    expect(shownCalls()[0]?.[1]).toMatchObject({ trigger: 'first_settlement', play_ms: STAR_MIN_PLAY_MS })
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

  it('asks on the timer at five minutes, and lets a moment ask after three', () => {
    expect(STAR_DELAY_MIN_MS).toBe(FIVE_MINUTES_MS)
    expect(STAR_MIN_PLAY_MS).toBe(THREE_MINUTES_MS)
  })

  it('shows a moment that comes after the floor straight away', () => {
    const update = mount(worldWith())
    wait(THREE_MINUTES_MS + 30_000)
    expect(toast()).toBeNull()
    update(worldWith([settlement()], 600))
    expect(shownCalls()).toHaveLength(1)
    expect(shownCalls()[0]?.[1]).toMatchObject({
      trigger: 'first_settlement',
      play_ms: THREE_MINUTES_MS + 30_000,
    })
  })

  describe('once per player across worlds', () => {
    it('does not ask again after the player restarts the world (world goes away and comes back)', () => {
      const update = mount(worldWith())
      update(worldWith([settlement()], 600))
      wait(STAR_MIN_PLAY_MS)
      expect(shownCalls()).toHaveLength(1)
      // The toast is still up, not dismissed, when the player restarts.
      expect(toast()).not.toBeNull()
      expect(state()).toMatchObject({ asks: 1 })

      update(null)
      update(worldWith([], 0))
      update(worldWith([settlement()], 600, { battles: [], headlines: [] }))
      wait(STAR_DELAY_MIN_MS * 3)
      expect(shownCalls()).toHaveLength(1)
    })

    it('does not ask again in a new world after a reload remounts the app', () => {
      mount(worldWith())
      wait(STAR_DELAY_MIN_MS)
      expect(shownCalls()).toHaveLength(1)
      act(() => roots.splice(0).forEach((root) => root.unmount()))
      // A reload starts a fresh tab session; only localStorage survives.
      window.sessionStorage.clear()

      const update = mount(worldWith())
      update(worldWith([settlement()], 600))
      wait(STAR_DELAY_MIN_MS * 3)
      expect(toast()).toBeNull()
      expect(shownCalls()).toHaveLength(1)
    })

    it('does not ask again when a new world restarts the tick in the same mount', () => {
      const update = mount(worldWith([], 0, { battles: [] }))
      wait(STAR_DELAY_MIN_MS)
      expect(shownCalls()).toHaveLength(1)
      update(worldWith([], 0, { battles: [] }))
      update(worldWith([settlement()], 50, { headlines: [{ tick: 50, text: 'A coup in Firstfolk' }] }))
      wait(STAR_DELAY_MIN_MS * 3)
      expect(shownCalls()).toHaveLength(1)
    })

    it('stays hidden when storage accepts the write but does not keep it', () => {
      const real = window.localStorage
      const forgetful = { ...memoryStorage(), getItem: () => null, setItem: () => undefined } as Storage
      Object.defineProperty(window, 'localStorage', { value: forgetful, configurable: true })
      mount()
      wait(STAR_DELAY_MIN_MS * 3)
      expect(toast()).toBeNull()
      expect(shownCalls()).toHaveLength(0)
      Object.defineProperty(window, 'localStorage', { value: real, configurable: true })
    })

    it('gives way when another tab records the ask while a moment waits for the floor', () => {
      const update = mount(worldWith())
      update(worldWith([settlement()], 600))
      wait(STAR_MIN_PLAY_MS - 1_000)
      window.localStorage.setItem(STAR_PROMPT_KEY, JSON.stringify({ asks: 1 }))
      act(() => void window.dispatchEvent(new StorageEvent('storage', { key: STAR_PROMPT_KEY })))
      wait(STAR_DELAY_MIN_MS * 3)
      expect(toast()).toBeNull()
      expect(shownCalls()).toHaveLength(0)
    })
  })

  describe('in a head-start world', () => {
    const opening = () => worldWith([tribe('a'), tribe('b'), tribe('c', 0)], 0)

    for (const mode of ['head_start', 'head_start_reddit'] as const) {
      it(`asks at the first settlement founded after the session starts (${mode})`, () => {
        const update = mountAs(mode, opening())
        // The opening settlements growing, and a starting tribe's camp reaching tier one, are not news.
        update(worldWith([tribe('a', 2), tribe('b'), tribe('c', 1)], 300))
        update(worldWith([tribe('a', 2), tribe('b'), tribe('c', 1), tribe('d', 0)], 400))
        update(worldWith([tribe('a', 2), tribe('b'), tribe('c', 1), tribe('d', 1)], 500))
        wait(STAR_MIN_PLAY_MS - 1)
        expect(toast()).toBeNull()
        wait(1)
        expect(toast()?.textContent).toContain('Your first settlement!')
        expect(trackEvent).toHaveBeenCalledWith('star_prompt_shown', {
          trigger: 'first_settlement',
          play_ms: STAR_MIN_PLAY_MS,
          ask_number: 1,
          start_mode: mode,
        })
        act(() => (toast()?.querySelector('.desktop-toast-secondary') as HTMLButtonElement).click())
        expect(trackEvent).toHaveBeenCalledWith('star_prompt_dismissed', {
          trigger: 'first_settlement',
          start_mode: mode,
        })
        expect(shownCalls()).toHaveLength(1)
      })
    }

    it('does not count the settlements it starts with, and falls back to the five-minute timer', () => {
      const update = mountAs('head_start', opening())
      update(worldWith([tribe('a', 3), tribe('b', 2), tribe('c', 1)], 2_000))
      wait(STAR_DELAY_MIN_MS - 1)
      expect(toast()).toBeNull()
      wait(1)
      expect(shownCalls()).toHaveLength(1)
      expect(shownCalls()[0]?.[1]).toMatchObject({ trigger: 'timer', start_mode: 'head_start' })
    })

    it('still asks only once and respects an earlier dismissal', () => {
      window.localStorage.setItem(STAR_PROMPT_KEY, JSON.stringify({ asks: 1, dismissedAt: Date.now() }))
      const update = mountAs('head_start', opening())
      update(worldWith([tribe('a'), tribe('b'), tribe('c'), tribe('d')], 500))
      wait(STAR_DELAY_MIN_MS * 4)
      expect(toast()).toBeNull()
      expect(shownCalls()).toHaveLength(0)
    })
  })

  describe('in a year-one world', () => {
    it('asks at the first settlement as before', () => {
      const update = mountAs('year_one', worldWith())
      update(worldWith([tribe('a')], 600))
      wait(STAR_MIN_PLAY_MS)
      expect(shownCalls()).toEqual([
        [
          'star_prompt_shown',
          { trigger: 'first_settlement', play_ms: STAR_MIN_PLAY_MS, ask_number: 1, start_mode: 'year_one' },
        ],
      ])
    })

    it('treats a later tribe founding as no new moment once a settlement has been seen', () => {
      const update = mountAs('year_one', worldWith([tribe('a')], 0))
      update(worldWith([tribe('a'), tribe('b')], 600))
      wait(STAR_DELAY_MIN_MS - 1)
      expect(toast()).toBeNull()
      wait(1)
      expect(shownCalls()[0]?.[1]).toMatchObject({ trigger: 'timer' })
    })
  })

  describe('delightful moments', () => {
    const battle = {
      id: 'battle-1',
      attackers: ['a'],
      defenders: ['b'],
      scale: 'raid' as const,
      location: [1, 1] as [number, number],
      started_tick: 400,
      ended: false,
      casualties_a: 0,
      casualties_d: 0,
      initial_a: 4,
      initial_d: 4,
    }

    it('holds a war that breaks out early until three minutes', () => {
      const update = mount(worldWith([], 0, { battles: [] }))
      update(worldWith([], 400, { battles: [battle] }))
      wait(STAR_MIN_PLAY_MS - 1)
      expect(toast()).toBeNull()
      expect(shownCalls()).toHaveLength(0)
      wait(1)
      expect(shownCalls()).toEqual([
        ['star_prompt_shown', { trigger: 'first_war', play_ms: STAR_MIN_PLAY_MS, ask_number: 1 }],
      ])
      expect(toast()?.textContent).toContain('War has broken out!')
    })

    it('holds a coup that happens early until three minutes', () => {
      const update = mount(worldWith([], 0, { headlines: [] }))
      update(worldWith([], 800, { headlines: [{ tick: 800, text: 'Mira seized power in a coup' }] }))
      wait(STAR_MIN_PLAY_MS - 1)
      expect(toast()).toBeNull()
      wait(1)
      expect(shownCalls()).toEqual([
        ['star_prompt_shown', { trigger: 'first_coup', play_ms: STAR_MIN_PLAY_MS, ask_number: 1 }],
      ])
      expect(toast()?.textContent).toContain('A coup!')
    })

    it('holds an early settlement until three minutes', () => {
      const update = mount(worldWith())
      update(worldWith([settlement()], 200))
      wait(STAR_MIN_PLAY_MS - 1)
      expect(toast()).toBeNull()
      wait(1)
      expect(shownCalls()).toEqual([
        ['star_prompt_shown', { trigger: 'first_settlement', play_ms: STAR_MIN_PLAY_MS, ask_number: 1 }],
      ])
    })

    it('does not treat a newly invented word as a moment', () => {
      const update = mount(worldWith([], 0, { lineage_words: {} }))
      update(worldWith([], 200, { lineage_words: { a: { water: 'miku' } } }))
      wait(STAR_DELAY_MIN_MS - 1)
      expect(toast()).toBeNull()
      expect(shownCalls()).toHaveLength(0)
      wait(1)
      expect(shownCalls()).toEqual([
        ['star_prompt_shown', { trigger: 'timer', play_ms: STAR_DELAY_MIN_MS, ask_number: 1 }],
      ])
    })

    it('still asks at a settlement that arrives in the same update as a new word', () => {
      const update = mount(worldWith([], 0, { lineage_words: {} }))
      update(worldWith([settlement()], 200, { lineage_words: { a: { water: 'miku' } } }))
      wait(STAR_MIN_PLAY_MS)
      expect(shownCalls()[0]?.[1]).toMatchObject({ trigger: 'first_settlement' })
    })
  })
})
