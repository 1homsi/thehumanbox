// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PopulationChip } from './PopulationChip'
import { nextPopulationMilestone } from './population-milestone'

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

function render(population: number, sick: number) {
  act(() => root.render(<PopulationChip population={population} sick={sick} />))
  return container.querySelector('.population-badge') as HTMLElement | null
}

const hover = (el: Element | null) =>
  act(() => el!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))

describe('nextPopulationMilestone', () => {
  it('is the next milestone above the population', () => {
    expect(nextPopulationMilestone(0)).toBe(100)
    expect(nextPopulationMilestone(156)).toBe(250)
    expect(nextPopulationMilestone(250)).toBe(500)
    expect(nextPopulationMilestone(5000)).toBeUndefined()
  })
})

describe('PopulationChip', () => {
  it('renders nothing with no people and no sickness', () => {
    expect(render(0, 0)).toBeNull()
  })

  it('shows the living count alone while nobody is sick', () => {
    const chip = render(156, 0)
    expect(chip!.textContent).toBe('156')
    expect(chip!.classList.contains('has-sick')).toBe(false)
    expect(container.querySelector('.pop-sick')).toBeNull()
  })

  it('puts the sick count in the same chip while anyone is ill', () => {
    const chip = render(156, 3)
    expect(container.querySelectorAll('.population-badge').length).toBe(1)
    expect(chip!.classList.contains('has-sick')).toBe(true)
    expect(container.querySelector('.pop-sick')!.textContent).toBe('3')
    expect(chip!.textContent).toBe('1563')
  })

  it('explains the living and the sick, with the next milestone, in the tooltip', () => {
    const chip = render(156, 1)
    hover(chip)
    const tip = document.querySelector('.ui-tooltip')?.textContent ?? ''
    expect(tip).toContain('156 alive.')
    expect(tip).toContain('next milestone 250')
    expect(tip).toContain('1 person is sick. It spreads through close contact.')
  })

  it('says people are sick when more than one is', () => {
    const chip = render(200, 4)
    hover(chip)
    const tip = document.querySelector('.ui-tooltip')?.textContent ?? ''
    expect(tip).toContain('4 people are sick.')
  })
})
