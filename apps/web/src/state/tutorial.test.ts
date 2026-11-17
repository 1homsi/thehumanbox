// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const reset = vi.hoisted(() => vi.fn<(seed?: string) => boolean>(() => true))
const track = vi.hoisted(() => vi.fn())
vi.mock('../simulation/worldSource', () => ({
  readOwnWorldSeed: () => window.localStorage.getItem('thb-wasm-seed'),
  requestOwnWorldReset: reset,
}))
vi.mock('../shared/observability', () => ({ trackEvent: track }))

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

async function load() {
  vi.resetModules()
  return import('./tutorial')
}

beforeEach(() => {
  reset.mockClear()
  track.mockClear()
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
})

describe('tutorial', () => {
  it('starts by resetting to the tutorial seed', async () => {
    const { useTutorial, TUTORIAL_SEED } = await load()
    useTutorial.getState().begin('welcome')
    expect(reset).toHaveBeenCalledWith(TUTORIAL_SEED)
    expect(window.localStorage.getItem('thb-tutorial-step-v1')).toBe('0')
    expect(track).toHaveBeenCalledWith('tutorial_start', { source: 'welcome' }, { send_instantly: true })
  })

  it('resumes only in the tutorial world', async () => {
    window.localStorage.setItem('thb-tutorial-step-v1', '1')
    window.localStorage.setItem('thb-wasm-seed', '7')
    expect((await load()).useTutorial.getState().step).toBeNull()
    window.localStorage.setItem('thb-wasm-seed', (await load()).TUTORIAL_SEED)
    expect((await load()).useTutorial.getState().step).toBe(1)
  })

  it('moves on only when the asked power is used, then hands off to a new world', async () => {
    const { useTutorial, TUTORIAL_SEED, TUTORIAL_STEPS } = await load()
    window.localStorage.setItem('thb-wasm-seed', TUTORIAL_SEED)
    useTutorial.setState({ step: 0 })
    useTutorial.getState().noteTool('inspire')
    expect(useTutorial.getState().step).toBe(0)
    for (const s of TUTORIAL_STEPS) useTutorial.getState().noteTool(s.tool)
    expect(useTutorial.getState().step).toBe(TUTORIAL_STEPS.length)
    expect(track).toHaveBeenCalledWith('tutorial_step', { step: 'rain', index: 1, of: TUTORIAL_STEPS.length })
    useTutorial.getState().leave()
    expect(reset).toHaveBeenLastCalledWith()
    expect(track).toHaveBeenLastCalledWith(
      'tutorial_finish',
      { completed: true, step: 'done' },
      { send_instantly: true },
    )
    expect(window.localStorage.getItem('thb-tutorial-step-v1')).toBeNull()
    expect(window.localStorage.getItem('thb-opening-done-v1')).toBe('1')
  })
})
