import { describe, expect, it } from 'vitest'
import {
  buildTerritoryIndex,
  lineageAtTerritoryTile,
  territoryEmphasis,
  territoryStanding,
  territoryTileToViewport,
} from './territory'

describe('territory map interaction', () => {
  const territory = {
    claimed: [
      { lid: 'amber', tiles: [[2, 3] as [number, number], [3, 3] as [number, number]] },
      { lid: 'blue', tiles: [[3, 3] as [number, number], [4, 3] as [number, number]] },
    ],
    contested: [[3, 3] as [number, number]],
  }

  it('converts absolute claims into viewport-local tiles', () => {
    expect(territoryTileToViewport(43, 27, 32, 16)).toEqual([11, 11])
  })

  it('indexes authoritative claims and cycles owners on contested tiles', () => {
    const index = buildTerritoryIndex(territory)
    expect(lineageAtTerritoryTile(index, 2, 3)).toBe('amber')
    expect(lineageAtTerritoryTile(index, 3, 3, 'amber')).toBe('blue')
    expect(lineageAtTerritoryTile(index, 3, 3, 'blue')).toBe('amber')
    expect(lineageAtTerritoryTile(index, 8, 8)).toBeNull()
    expect(index.contested.has('3,3')).toBe(true)
  })

  it('distinguishes the selected civilization, allies, rivals, and neutral neighbors', () => {
    const relations = [
      { a: 'amber', b: 'blue', attitude: 70, status: 'ally' as const },
      { a: 'amber', b: 'red', attitude: -80, status: 'rivals' as const },
    ]
    expect(territoryStanding('amber', 'amber', relations)).toBe('self')
    expect(territoryStanding('blue', 'amber', relations)).toBe('ally')
    expect(territoryStanding('red', 'amber', relations)).toBe('rival')
    expect(territoryStanding('gray', 'amber', relations)).toBe('neutral')
    expect(territoryStanding('gray', null, relations)).toBe('unfocused')
  })

  it('gives selected and hostile borders stronger visual emphasis', () => {
    expect(territoryEmphasis('self').borderColor).toBe('#ffe39a')
    expect(territoryEmphasis('rival').borderColor).toBe('#ff625d')
    expect(territoryEmphasis('neutral').fillAlpha).toBeLessThan(territoryEmphasis('unfocused').fillAlpha)
  })
})
