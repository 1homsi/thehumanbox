// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { placeCard, runTour, tourSteps } from './tour-runner'

describe('tour', () => {
  it('stays short: five steps at most, and it still says when a tribe needs you', () => {
    const steps = tourSteps('local')
    expect(steps.length).toBeLessThanOrEqual(5)
    const text = steps.map((s) => s.text).join(' ')
    expect(text).toContain('prayer')
    expect(text).toContain('on the brink')
  })
})

describe('tour runner', () => {
  afterEach(() => {
    document.body.replaceChildren()
    window.localStorage.clear()
  })

  function mountTargets() {
    const map = document.createElement('div')
    map.setAttribute('data-tour', 'world-canvas')
    const settings = document.createElement('button')
    settings.setAttribute('data-tour', 'settings-btn')
    document.body.append(map, settings)
  }

  const card = () => document.querySelector('.thb-tour-card')
  const title = () => document.querySelector('.shepherd-title')?.textContent
  const buttons = () => [...document.querySelectorAll('.shepherd-footer button')].map((b) => b.textContent)

  it('walks the steps whose targets exist, then closes and remembers it was seen', () => {
    mountTargets()
    const tour = runTour('local')
    expect(tour).not.toBeNull()
    expect(card()?.getAttribute('role')).toBe('dialog')
    expect(title()).toBe('Your world')
    expect(buttons()).toEqual(['Next'])

    tour!.next()
    // The centred prayer step has no target, so it always stays.
    expect(title()).toBe('When they need you')
    expect(buttons()).toEqual(['Back', 'Next'])

    tour!.next()
    // .sandbox-bar and .header-actions are not on the page: their steps are skipped.
    expect(title()).toBe('That’s it, have fun')
    expect(buttons()).toEqual(['Back', 'Finish'])

    tour!.back()
    expect(title()).toBe('When they need you')

    tour!.complete()
    expect(document.querySelector('.thb-tour')).toBeNull()
    expect(window.localStorage.getItem('thb-tour-completed-v1')).toBe('1')
  })

  it('Escape cancels the tour', () => {
    mountTargets()
    runTour('local')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(document.querySelector('.thb-tour')).toBeNull()
  })

  it('starting again replaces a running tour instead of stacking cards', () => {
    mountTargets()
    runTour('local')
    runTour('local')
    expect(document.querySelectorAll('.thb-tour')).toHaveLength(1)
  })
})

describe('placeCard', () => {
  const view = { width: 1000, height: 800 }
  const card = { width: 300, height: 150 }

  it('centres the card when there is no target', () => {
    expect(placeCard(null, card, 'auto', view)).toEqual({ left: 350, top: 325 })
  })

  it('puts the card on the asked side when it fits', () => {
    const header = { left: 600, top: 10, width: 300, height: 40 }
    expect(placeCard(header, card, 'bottom', view)).toEqual({ left: 600, top: 64 })
  })

  it('falls back to a side with room, and stays on screen', () => {
    const dock = { left: 100, top: 700, width: 800, height: 60 }
    const pos = placeCard(dock, card, 'bottom', view)
    expect(pos.top + card.height).toBeLessThanOrEqual(700)
    expect(pos.left).toBeGreaterThanOrEqual(12)
  })

  it('floats over the middle of a target that fills the screen', () => {
    const map = { left: 0, top: 0, width: 1000, height: 800 }
    expect(placeCard(map, card, 'auto', view)).toEqual({ left: 350, top: 325 })
  })
})
