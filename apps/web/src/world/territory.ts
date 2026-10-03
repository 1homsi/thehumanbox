import type { TribalRelation, WorldState } from '../types'

type Territory = NonNullable<WorldState['territory']>

export interface TerritoryIndex {
  ownersByTile: Map<string, string[]>
  contested: Set<string>
}

export type TerritoryStanding = 'unfocused' | 'self' | 'ally' | 'rival' | 'neutral'

export interface TerritoryEmphasis {
  standing: TerritoryStanding
  fillAlpha: number
  borderColor: string | null
  borderWidth: number
}

let cachedTerritory: Territory | undefined
let cachedIndex: TerritoryIndex | undefined

export function territoryTileKey(x: number, y: number): string {
  return `${x},${y}`
}

export function territoryTileToViewport(
  x: number,
  y: number,
  originX: number,
  originY: number,
): [number, number] {
  return [x - originX, y - originY]
}

export function buildTerritoryIndex(territory: Territory | undefined): TerritoryIndex {
  if (territory === cachedTerritory && cachedIndex) return cachedIndex
  const ownersByTile = new Map<string, string[]>()
  if (territory) {
    for (const claim of territory.claimed) {
      for (const [x, y] of claim.tiles) {
        const key = territoryTileKey(x, y)
        const owners = ownersByTile.get(key)
        if (owners) {
          if (!owners.includes(claim.lid)) owners.push(claim.lid)
        } else {
          ownersByTile.set(key, [claim.lid])
        }
      }
    }
  }
  const index = {
    ownersByTile,
    contested: new Set(territory?.contested.map(([x, y]) => territoryTileKey(x, y)) ?? []),
  }
  cachedTerritory = territory
  cachedIndex = index
  return index
}

export function lineageAtTerritoryTile(
  index: TerritoryIndex,
  x: number,
  y: number,
  focusedLineage?: string | null,
): string | null {
  const owners = index.ownersByTile.get(territoryTileKey(x, y))
  if (!owners || owners.length === 0) return null
  if (!focusedLineage || owners.length === 1) return owners[0]
  const current = owners.indexOf(focusedLineage)
  return owners[(current + 1 + owners.length) % owners.length]
}

export function territoryStanding(
  lineageId: string,
  focusedLineage: string | null,
  relations: TribalRelation[],
): TerritoryStanding {
  if (!focusedLineage) return 'unfocused'
  if (lineageId === focusedLineage) return 'self'
  const relation = relations.find(
    ({ a, b }) => (a === focusedLineage && b === lineageId) || (b === focusedLineage && a === lineageId),
  )
  if (relation?.status === 'ally') return 'ally'
  if (relation?.status === 'rivals') return 'rival'
  return 'neutral'
}

export function territoryEmphasis(standing: TerritoryStanding): TerritoryEmphasis {
  switch (standing) {
    case 'self':
      return { standing, fillAlpha: 0.42, borderColor: '#ffe39a', borderWidth: 2.5 }
    case 'ally':
      return { standing, fillAlpha: 0.3, borderColor: '#58d98a', borderWidth: 2 }
    case 'rival':
      return { standing, fillAlpha: 0.32, borderColor: '#ff625d', borderWidth: 2 }
    case 'neutral':
      return { standing, fillAlpha: 0.1, borderColor: null, borderWidth: 1 }
    default:
      return { standing, fillAlpha: 0.24, borderColor: null, borderWidth: 1.5 }
  }
}
