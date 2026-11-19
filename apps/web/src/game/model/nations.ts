import type { NationRelationInfo, WorldState } from '../../shared/types'
import { territoryTileKey } from './territory'

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

export function nationLands(world: Pick<WorldState, 'nations' | 'territory'>): Map<number, NationLand> {
  const out = new Map<number, NationLand>()
  const nations = world.nations ?? []
  if (nations.length === 0 || !world.territory) return out
  const nationOf = new Map<string, number>()
  for (const n of nations) for (const m of n.members) nationOf.set(m, n.id)
  for (const claim of world.territory.claimed) {
    const id = nationOf.get(claim.lid)
    if (id === undefined) continue
    let land = out.get(id)
    if (!land) {
      land = { tiles: [], keys: new Set() }
      out.set(id, land)
    }
    for (const [x, y] of claim.tiles) {
      const key = territoryTileKey(x, y)
      if (land.keys.has(key)) continue
      land.keys.add(key)
      land.tiles.push([x, y])
    }
  }
  return out
}

export const NATION_CHUNK = 32
export const NATION_EDGE = 2

export interface NationChunkPaint {
  colour: number
  tint: number[]
  edge: number[]
}

export type NationChunks = Map<string, NationChunkPaint[]>

export function nationChunks(world: Pick<WorldState, 'nations' | 'territory'>, tile: number): NationChunks {
  const out: NationChunks = new Map()
  const lands = nationLands(world)
  for (const nation of world.nations ?? []) {
    const land = lands.get(nation.id)
    if (!land) continue
    const mine = new Map<string, NationChunkPaint>()
    const paintFor = (x: number, y: number) => {
      const key = `${Math.floor(x / NATION_CHUNK)},${Math.floor(y / NATION_CHUNK)}`
      let paint = mine.get(key)
      if (!paint) {
        paint = { colour: nation.colour, tint: [], edge: [] }
        mine.set(key, paint)
        const list = out.get(key)
        if (list) list.push(paint)
        else out.set(key, [paint])
      }
      return paint
    }
    const owns = (x: number, y: number) => land.keys.has(territoryTileKey(x, y))
    for (const [x, y] of land.tiles) {
      const paint = paintFor(x, y)
      const px = x * tile
      const py = y * tile
      paint.tint.push(px, py, tile, tile)
      if (!owns(x, y - 1)) paint.edge.push(px, py, tile, NATION_EDGE)
      if (!owns(x + 1, y)) paint.edge.push(px + tile - NATION_EDGE, py, NATION_EDGE, tile)
      if (!owns(x, y + 1)) paint.edge.push(px, py + tile - NATION_EDGE, tile, NATION_EDGE)
      if (!owns(x - 1, y)) paint.edge.push(px, py, NATION_EDGE, tile)
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
