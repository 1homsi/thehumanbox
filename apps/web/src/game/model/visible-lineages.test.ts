import { describe, expect, it } from 'vitest'
import { visibleLineages } from './tribe-peril'

describe('lineage list', () => {
  const big = (id: string, count: number) => ({ id, count })
  it('puts tribes on the brink first, the smallest first, even past the limit', () => {
    const rows = [
      big('a', 60),
      big('b', 55),
      big('c', 50),
      big('d', 45),
      big('e', 40),
      big('f', 35),
      { id: 'tiny', count: 3, peril: 'no_children' },
      { id: 'small', count: 8, peril: 'dwindling' },
    ]
    const shown = visibleLineages(rows)
    expect(shown.map((r) => r.id)).toEqual(['tiny', 'small', 'a', 'b', 'c'])
  })

  it('shows every endangered tribe when there are more than the limit', () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, count: i + 1, peril: 'hunger' }))
    expect(visibleLineages(rows)).toHaveLength(7)
  })

  it('lists the largest tribes when none is in danger', () => {
    expect(visibleLineages([big('x', 2), big('y', 9)]).map((r) => r.id)).toEqual(['y', 'x'])
  })
})
