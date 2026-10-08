import { describe, expect, it } from 'vitest'
import { crownCentre, crownSpeck, dressingFor } from './tree-dressing'

describe('dressingFor', () => {
  it('dresses spring, autumn and winter, and leaves summer bare', () => {
    expect(dressingFor('summer')).toBeNull()
    expect(dressingFor('spring')?.count).toBe(9)
    expect(dressingFor('autumn')?.count).toBe(7)
    expect(dressingFor('winter')?.topOnly).toBe(true)
    expect(dressingFor('spring')?.topOnly).toBe(false)
  })
})

describe('crownSpeck', () => {
  it('keeps every speck inside the crown ellipse', () => {
    const dressing = dressingFor('spring')!
    const sz = 24
    const crown = crownCentre(100, 200, sz)
    for (let seed = 0; seed < 40; seed++) {
      for (let k = 0; k < dressing.count; k++) {
        const s = crownSpeck(dressing, seed, k, 100, 200, sz)
        const nx = (s.x - crown.x) / crown.rx
        const ny = (s.y - crown.y) / crown.ry
        expect(nx * nx + ny * ny).toBeLessThanOrEqual(1 + 1e-9)
      }
    }
  })

  it('puts winter snow on the upper half of the crown only', () => {
    const dressing = dressingFor('winter')!
    const sz = 24
    const crown = crownCentre(50, 80, sz)
    for (let seed = 0; seed < 40; seed++) {
      for (let k = 0; k < dressing.count; k++) {
        expect(crownSpeck(dressing, seed, k, 50, 80, sz).y).toBeLessThanOrEqual(crown.y + 1e-9)
      }
    }
  })

  it('is stable for the same tree and speck, and varies between trees', () => {
    const dressing = dressingFor('autumn')!
    const a = crownSpeck(dressing, 3, 2, 10, 10, 20)
    expect(crownSpeck(dressing, 3, 2, 10, 10, 20)).toEqual(a)
    const others = new Set<number>()
    for (let seed = 0; seed < 20; seed++) others.add(crownSpeck(dressing, seed, 0, 10, 10, 20).x)
    expect(others.size).toBeGreaterThan(10)
  })

  it('sizes specks to the tree and never below one pixel', () => {
    const dressing = dressingFor('spring')!
    expect(crownSpeck(dressing, 1, 1, 0, 0, 4).size).toBe(1)
    expect(crownSpeck(dressing, 1, 1, 0, 0, 40).size).toBe(3)
  })
})
