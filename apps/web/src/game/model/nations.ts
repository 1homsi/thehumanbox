import type { NationRelationInfo, WorldState } from '../../shared/types'
import { territoryTileKey } from './territory'
import { isPermanentWaterTile } from './terrain-ids'

export const TOWN_LAND_REACH = 10

export const NATION_PALETTE: readonly (readonly [number, number, number])[] = [
  [192, 57, 43],
  [46, 111, 189],
  [212, 160, 23],
  [123, 63, 160],
  [31, 138, 112],
  [211, 84, 0],
  [168, 50, 121],
  [60, 141, 47],
  [93, 109, 126],
  [142, 90, 43],
  [224, 93, 138],
  [43, 179, 192],
]

export function nationRgb(colour: number): readonly [number, number, number] {
  const n = NATION_PALETTE.length
  return NATION_PALETTE[((Math.trunc(colour) % n) + n) % n]!
}

export function nationColour(colour: number, alpha = 1): string {
  const [r, g, b] = nationRgb(colour)
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`
}

export interface NationLand {
  tiles: [number, number][]
  keys: Set<string>
}

export function nationLands(
  world: Pick<WorldState, 'nations' | 'territory' | 'towns'> & { grid?: Partial<WorldState['grid']> },
): Map<number, NationLand> {
  const out = new Map<number, NationLand>()
  const nations = world.nations ?? []
  if (nations.length === 0) return out
  const nationOf = new Map<string, number>()
  for (const n of nations) for (const m of n.members) nationOf.set(m, n.id)
  const landOf = (id: number) => {
    let land = out.get(id)
    if (!land) {
      land = { tiles: [], keys: new Set() }
      out.set(id, land)
    }
    return land
  }
  const add = (land: NationLand, x: number, y: number) => {
    const key = territoryTileKey(x, y)
    if (land.keys.has(key)) return
    land.keys.add(key)
    land.tiles.push([x, y])
  }
  for (const claim of world.territory?.claimed ?? []) {
    const id = nationOf.get(claim.lid)
    if (id === undefined) continue
    const land = landOf(id)
    for (const [x, y] of claim.tiles) add(land, x, y)
  }
  const tiles = world.grid?.tiles
  const ox = world.grid?.origin_x ?? 0
  const oy = world.grid?.origin_y ?? 0
  for (const town of world.towns ?? []) {
    const id = nationOf.get(town.lineage_id)
    if (id === undefined) continue
    const land = landOf(id)
    const [cx, cy] = town.center
    for (let y = cy - TOWN_LAND_REACH; y <= cy + TOWN_LAND_REACH; y++) {
      for (let x = cx - TOWN_LAND_REACH; x <= cx + TOWN_LAND_REACH; x++) {
        if (isPermanentWaterTile(tiles?.[y - oy]?.[x - ox])) continue
        add(land, x, y)
      }
    }
  }
  return out
}

export type RelationTone = 'war' | 'allied' | 'vassal' | 'overlord' | 'peace' | 'friendly' | 'wary'

export function relationTone(relation: NationRelationInfo): RelationTone | null {
  if (relation.status) return relation.status
  if (relation.opinion >= 0.2) return 'friendly'
  if (relation.opinion <= -0.2) return 'wary'
  return null
}
