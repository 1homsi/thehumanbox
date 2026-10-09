// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WorldState } from '../../shared/types'
import { WeatherChip } from './WeatherChip'
import { weatherConditions } from './weather-conditions'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.querySelectorAll('.ui-tooltip').forEach((el) => el.remove())
})

type Sky = Pick<WorldState, 'weather' | 'drought'>
const CLEAR: Sky = { weather: { kind: 'clear', intensity: 0 } as WorldState['weather'], drought: false }
const RAIN: Sky = { ...CLEAR, weather: { kind: 'rain', intensity: 0.5 } as WorldState['weather'] }
const STORM: Sky = { ...CLEAR, weather: { kind: 'storm', intensity: 0.8 } as WorldState['weather'] }
const DROUGHT: Sky = { ...CLEAR, drought: true }

function render(sky: Sky) {
  act(() => root.render(<WeatherChip world={sky} />))
  return container.querySelector('.weather-chip') as HTMLElement | null
}

describe('weatherConditions', () => {
  it('lists nothing in clear, dry weather', () => {
    expect(weatherConditions(CLEAR)).toEqual([])
    expect(
      weatherConditions({ weather: undefined as unknown as WorldState['weather'], drought: false }),
    ).toEqual([])
  })

  it('lists rain, storm and drought in that order, as their own conditions', () => {
    expect(weatherConditions(RAIN).map((c) => c.key)).toEqual(['rain'])
    expect(weatherConditions(STORM).map((c) => c.key)).toEqual(['storm'])
    expect(weatherConditions(DROUGHT).map((c) => c.key)).toEqual(['drought'])
    expect(weatherConditions({ ...RAIN, drought: true }).map((c) => c.key)).toEqual(['rain', 'drought'])
    expect(weatherConditions({ ...STORM, drought: true }).map((c) => c.key)).toEqual(['storm', 'drought'])
  })
})

describe('WeatherChip', () => {
  it('renders nothing in clear, dry weather', () => {
    expect(render(CLEAR)).toBeNull()
  })

  it('shows rain as one icon, with no word', () => {
    const chip = render(RAIN)
    expect(chip).not.toBeNull()
    expect(chip!.classList.contains('rain')).toBe(true)
    expect(chip!.querySelectorAll('svg').length).toBe(1)
    expect(chip!.textContent).toBe('')
    expect(chip!.getAttribute('aria-label')).toBe('rain')
  })

  it('shows a storm in the storm tint', () => {
    const chip = render(STORM)
    expect(chip!.classList.contains('storm')).toBe(true)
    expect(chip!.getAttribute('aria-label')).toBe('storm')
  })

  it('merges rain and drought into one chip, tinted by the drought, which is the more severe', () => {
    const chip = render({ ...RAIN, drought: true })
    expect(container.querySelectorAll('.weather-chip').length).toBe(1)
    expect(chip!.querySelectorAll('svg').length).toBe(2)
    expect(chip!.classList.contains('drought')).toBe(true)
    expect(chip!.getAttribute('aria-label')).toBe('rain, drought')
  })

  it('tints a storm with drought as a storm, the most severe', () => {
    const chip = render({ ...STORM, drought: true })
    expect(chip!.classList.contains('storm')).toBe(true)
    expect(chip!.querySelectorAll('svg').length).toBe(2)
  })

  it('names each condition and what it does in the tooltip', () => {
    const chip = render({ ...RAIN, drought: true })
    act(() => chip!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
    const tip = document.querySelector('.ui-tooltip')?.textContent ?? ''
    expect(tip).toContain('rain')
    expect(tip).toContain('Helps dry land recover faster.')
    expect(tip).toContain('drought')
    expect(tip).toContain('Water is shrinking and thirst deaths are rising.')
  })
})
