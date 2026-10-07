import { describe, expect, it } from 'vitest'
import { TextLayer } from 'cubeforge'
import { PeopleNameLayer } from './people-names'

function frame(layer: PeopleNameLayer, runs: [string, number, number, 'name' | 'thought', number][]) {
  layer.begin()
  for (const [text, x, y, style, alpha] of runs) layer.text(text, x, y, style, alpha)
  layer.end()
}

describe('PeopleNameLayer', () => {
  it('keeps one run per label, in the order they were given, and drops the rest', () => {
    const text = new TextLayer({ zIndex: 45.6 })
    const names = new PeopleNameLayer(text)
    frame(names, [
      ['ADA', 10, 20, 'name', 1],
      ['chopping', 10, 10, 'thought', 1],
      ['BO', 40, 20, 'name', 0.12],
    ])
    expect(text.count).toBe(3)
    expect(text.texts.slice(0, 3)).toEqual(['ADA', 'chopping', 'BO'])
    frame(names, [['ADA', 10, 20, 'name', 1]])
    expect(text.count).toBe(1)
    expect(text.texts.slice(0, 1)).toEqual(['ADA'])
  })

  it('touches the layer only when a run changed, not on a frame where nothing moved', () => {
    const text = new TextLayer({ zIndex: 45.6 })
    const names = new PeopleNameLayer(text)
    frame(names, [['ADA', 10, 20, 'name', 1]])
    const settled = text.version
    frame(names, [['ADA', 10, 20, 'name', 1]])
    expect(text.version).toBe(settled)
    frame(names, [['ADA', 11, 20, 'name', 1]])
    expect(text.version).toBeGreaterThan(settled)
    expect(text.x[0]).toBe(11)
  })

  it('writes a new text, style or alpha into an existing run', () => {
    const text = new TextLayer({ zIndex: 45.6 })
    const names = new PeopleNameLayer(text)
    frame(names, [['ADA', 10, 20, 'name', 1]])
    frame(names, [['ADA', 10, 20, 'thought', 1]])
    expect(text.alpha[0]).toBeCloseTo(0.9)
    expect(text.style[0]).not.toBe(0)
    frame(names, [['BO', 10, 20, 'thought', 1]])
    expect(text.texts[0]).toBe('BO')
  })
})
