// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { speedTools } from './dock-tabs'
import { TimeControl } from './TimeControl'
import { formatSpeed } from '../../simulation/speedSteps'
import { useWorldStore } from '../../state/worldStore'
import type { WorldState } from '../../shared/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

function render(props: Partial<Parameters<typeof TimeControl>[0]> = {}) {
  const all = { paused: false, speed: 1, onPick: vi.fn(), ...props }
  act(() => root.render(<TimeControl {...all} />))
  return all
}
const q = (selector: string) => container.querySelector<HTMLElement>(selector)
const click = (el: Element | null) => {
  if (!el) throw new Error('missing element')
  act(() => (el as HTMLElement).click())
}
const key = (k: string) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
  })

beforeEach(() => {
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

describe('the time control', () => {
  it('pauses and resumes', () => {
    const props = render()
    click(q('[aria-label="Pause simulation"]'))
    expect(props.onPick).toHaveBeenLastCalledWith(expect.objectContaining({ time: { control: 'pause' } }))
    render({ ...props, paused: true })
    click(q('[aria-label="Resume simulation"]'))
    expect(props.onPick).toHaveBeenLastCalledWith(expect.objectContaining({ time: { control: 'resume' } }))
  })

  it('steps one speed faster or slower from the speed the world runs at', () => {
    const props = render({ speed: 1 })
    expect(q('.time-speed-value')?.textContent).toBe('1×')
    click(q('[aria-label="faster"]'))
    expect(props.onPick).toHaveBeenLastCalledWith(
      expect.objectContaining({ time: { control: 'speed', mult: 2 } }),
    )
    click(q('[aria-label="slower"]'))
    expect(props.onPick).toHaveBeenLastCalledWith(
      expect.objectContaining({ time: { control: 'speed', mult: 0.5 } }),
    )
  })

  it('stops stepping at either end', () => {
    render({ speed: 0.25 })
    expect(q('[aria-label="slower"]')?.hasAttribute('disabled')).toBe(true)
    render({ speed: 5000 })
    expect(q('[aria-label="faster"]')?.hasAttribute('disabled')).toBe(true)
  })

  it('steps with the , and . keys', () => {
    const props = render({ speed: 4 })
    key('.')
    expect(props.onPick).toHaveBeenLastCalledWith(
      expect.objectContaining({ time: { control: 'speed', mult: 8 } }),
    )
    key(',')
    expect(props.onPick).toHaveBeenLastCalledWith(
      expect.objectContaining({ time: { control: 'speed', mult: 2 } }),
    )
  })

  it('opens the list of every speed from the value, picks one, and closes', () => {
    const props = render({ speed: 10 })
    expect(q('.time-speed-list')).toBeNull()
    click(q('.time-speed-value'))
    const items = [...container.querySelectorAll('.time-speed-list button')]
    expect(items.map((b) => b.getAttribute('aria-label'))).toEqual(
      speedTools().map((t) => `Speed ${formatSpeed(t.time?.mult ?? 1)}`),
    )
    expect(q('[aria-label="Speed 10×"]')?.getAttribute('aria-checked')).toBe('true')
    click(q('[aria-label="Speed 5000×"]'))
    expect(props.onPick).toHaveBeenLastCalledWith(speedTools().find((t) => t.id === 'fast5000'))
    expect(q('.time-speed-list')).toBeNull()
  })

  it('closes the list on Escape and on a click elsewhere', () => {
    render()
    click(q('.time-speed-value'))
    key('Escape')
    expect(q('.time-speed-list')).toBeNull()
    click(q('.time-speed-value'))
    act(() => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    })
    expect(q('.time-speed-list')).toBeNull()
  })
})

describe('the lagging mark', () => {
  // The clock is stubbed from before the first render, whose sample starts the measurement.
  const runTicks = (samples: [number, number][]) => {
    const now = vi.mocked(performance.now)
    for (const [ms, tick] of samples) {
      now.mockReturnValue(ms)
      act(() => useWorldStore.setState({ world: { tick } as WorldState }))
    }
  }

  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(0)
  })

  it('marks the speed when this computer falls well behind it', () => {
    render({ speed: 40 })
    // 50 ticks a second is 6× at the 120 ms base tick, far short of 40×.
    runTicks([
      [0, 0],
      [1000, 50],
      [2000, 100],
    ])
    expect(q('.time-control')?.classList.contains('lagging')).toBe(true)
    expect(q('.time-lag')).not.toBeNull()
  })

  it('stays quiet while the world keeps up', () => {
    render({ speed: 40 })
    // 333 ticks a second is 40×.
    runTicks([
      [0, 0],
      [1000, 333],
      [2000, 667],
    ])
    expect(q('.time-lag')).toBeNull()
  })
})

describe('speed labels', () => {
  it('writes halves and quarters as fractions', () => {
    expect(formatSpeed(0.5)).toBe('½×')
    expect(formatSpeed(0.25)).toBe('¼×')
    expect(formatSpeed(1)).toBe('1×')
    expect(formatSpeed(5000)).toBe('5000×')
  })

  it('lists the time tools slowest first, from slow to 5000×', () => {
    const mults = speedTools().map((t) => t.time?.mult)
    expect(mults).toEqual([...mults].sort((a, b) => (a ?? 0) - (b ?? 0)))
    expect(mults[0]).toBe(0.5)
    expect(mults.at(-1)).toBe(5000)
  })
})
