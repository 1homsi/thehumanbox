import { describe, expect, it } from 'vitest'
import { PAD_BOT } from './kit'
import { shadowRows } from './shadow'
import { buildingArt } from './sprite'

const sig = (a: { w: number; h: number; px: Uint8Array } | null) =>
  a ? `${a.w}x${a.h}:${a.px.join(',')}` : 'none'

describe('the baked building sprite', () => {
  it('draws a kind the map does not know as a plain house, never as an emoji', () => {
    expect(sig(buildingArt('FutureKindFromTheSim', 3, 3, 0, 0, 1, 3))).toBe(
      sig(buildingArt('House', 3, 3, 0, 0, 1, 3)),
    )
  })

  it('puts snow only on the buildings that keep it on their roofs', () => {
    expect(sig(buildingArt('House', 3, 3, 0, 0, 1, 3, '', true))).not.toBe(
      sig(buildingArt('House', 3, 3, 0, 0, 1, 3)),
    )
    expect(sig(buildingArt('Well', 1, 1, 0, 0, 1, 3, '', true))).toBe(
      sig(buildingArt('Well', 1, 1, 0, 0, 1, 3)),
    )
  })

  it('cracks a building in poor repair', () => {
    expect(sig(buildingArt('House', 3, 3, 0, 0, 0, 3))).not.toBe(sig(buildingArt('House', 3, 3, 0, 0, 1, 3)))
  })

  it('takes a tribe’s roof by name and ignores anything else', () => {
    expect(sig(buildingArt('House', 3, 3, 0, 0, 1, 3, '', false, '', 'slate'))).not.toBe(
      sig(buildingArt('House', 3, 3, 0, 0, 1, 3, '', false, '', 'moss')),
    )
    expect(sig(buildingArt('House', 3, 3, 0, 0, 1, 3, '', false, '', '#93513a'))).toBe(
      sig(buildingArt('House', 3, 3, 0, 0, 1, 3)),
    )
  })
})

describe('the cast shadow', () => {
  it('falls to the bottom-right of the base, inside the cell', () => {
    const rows = shadowRows(8, 31, 50, 24, 8)
    expect(rows.length).toBeGreaterThan(1)
    for (const row of rows) {
      expect(row.x1).toBeGreaterThan(row.x0)
      expect(row.x0).toBeGreaterThan(8)
      expect(row.y).toBeLessThan(50 + PAD_BOT)
    }
    // It leans right as it goes down.
    expect(rows[rows.length - 1].x1).toBeGreaterThan(rows[0].x1)
  })

  it('reaches further for a taller building', () => {
    const reach = (h: number) => Math.max(...shadowRows(8, 31, 50, h, 8).map((r) => r.x1))
    expect(reach(40)).toBeGreaterThan(reach(8))
  })
})
