import { describe, expect, it } from 'vitest'
import { TextLayer } from 'xipjs'
import { PeopleNameLayer } from './people-names'

function frame(layer: PeopleNameLayer, runs: [string, number, number, 'name' | 'thought', number][]) {
  layer.begin()
  for (let slot = 0; slot < runs.length; slot++) {
    const [text, x, y, style, alpha] = runs[slot]!
    layer.text(text, x, y, style, alpha, slot)
  }
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

  it('follows the rounded sprite position between label rebuilds', () => {
    const text = new TextLayer({ zIndex: 45.6 })
    const names = new PeopleNameLayer(text)
    const people = {
      orgs: [{ sex: 'female' }],
      px: [40.2],
      py: [50.1],
      radius: [5],
    }
    names.follow(people as never)
    frame(names, [['ADA', 40, 35, 'name', 1]])
    const first = [text.x[0], text.y[0]]
    people.px[0] = 42.3
    people.py[0] = 51.2
    names.follow(people as never)
    expect(text.x[0]).toBeGreaterThan(first[0]!)
    expect(text.x[0]).toBe(Math.trunc(Math.round(42.3 - 19 / 2) + 19 / 2))
    expect(text.y[0]).toBe(Math.trunc(Math.round(51.2 - 19 * 0.78) + (35 - Math.round(50.1 - 19 * 0.78))))
  })

  it('reduces a 64 ms render-frame walk drift from 9 px to 0 px at close zoom', () => {
    const text = new TextLayer({ zIndex: 45.6 })
    const names = new PeopleNameLayer(text)
    const people = {
      orgs: [{ sex: 'female' }],
      px: [40.2],
      py: [50.1],
      radius: [5],
    }
    names.follow(people as never)
    frame(names, [['ADA', 40, 35, 'name', 1]])
    const staleX = text.x[0]!
    let beforeMaxPx = 0
    let afterMaxPx = 0
    for (let i = 1; i <= 4; i++) {
      people.px[0] = 40.2 + i * 0.8
      names.follow(people as never)
      const spriteX = Math.trunc(Math.round(people.px[0]! - 19 / 2) + 19 / 2)
      beforeMaxPx = Math.max(beforeMaxPx, Math.abs(staleX - spriteX) * 3)
      afterMaxPx = Math.max(afterMaxPx, Math.abs(text.x[0]! - spriteX) * 3)
    }
    expect(beforeMaxPx).toBe(9)
    expect(afterMaxPx).toBe(0)
  })
})
