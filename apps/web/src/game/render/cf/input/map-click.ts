import type { PrayerInfo, WorldState } from '../../../../shared/types'
import type { ViewFlags } from '../../../../state/store'
import { TILE_ID, isWaterTile } from '../../../model/terrain-ids'
import { hasRuinedBuildingAtWorldTile } from '../../../model/building-state'
import { lineageAtTerritoryTile, type TerritoryIndex } from '../../../model/territory'
import { TILE } from '../../../model/palette'
import { prayerAtPoint } from '../../prayer-bubbles'

/** Everything the map needs to decide what a click at one point means. */
export interface MapClickInput {
  /** The point in map pixels (tile coordinate times TILE, origin at the map corner). */
  mapX: number
  mapY: number
  zoom: number
  world: WorldState
  /** World coordinates of the map's top-left tile. */
  ox: number
  oy: number
  sandboxArmed: boolean
  prayerClicksEnabled: boolean
  viewFlags: ViewFlags
  focus: string
  territoryIndex: TerritoryIndex
  /** A touch screen: fingers are fat, so people are easier to hit. */
  coarsePointer: boolean
  /** The person drawn under a map point (the sprite layer's pick), when one is. */
  pickPerson?: (mapX: number, mapY: number) => string | null | undefined
}

/** What a click did. The caller performs it, so the decision stays pure and testable. */
export type MapClickOutcome =
  | { kind: 'ignore' }
  | { kind: 'sandbox'; worldX: number; worldY: number }
  | { kind: 'prayer'; prayer: PrayerInfo }
  | { kind: 'territory'; lineageId: string | null }
  | { kind: 'enter-home'; orgId: string }
  | { kind: 'select'; orgId: string | null }

/** The click rules of the world map, in the order they have always applied. */
export function resolveMapClick(input: MapClickInput): MapClickOutcome {
  const { world, ox, oy, zoom, viewFlags, focus } = input
  const canvasTileX = input.mapX / TILE
  const canvasTileY = input.mapY / TILE
  const worldX = canvasTileX + ox
  const worldY = canvasTileY + oy

  if (
    canvasTileX < 0 ||
    canvasTileY < 0 ||
    canvasTileX >= world.grid.width ||
    canvasTileY >= world.grid.height
  )
    return { kind: 'ignore' }

  if (input.sandboxArmed) {
    if (
      Math.round(worldX) < ox ||
      Math.round(worldX) >= ox + world.grid.width ||
      Math.round(worldY) < oy ||
      Math.round(worldY) >= oy + world.grid.height
    )
      return { kind: 'ignore' }
    return { kind: 'sandbox', worldX, worldY }
  }

  // A prayer bubble is a button: clicking it goes to help that tribe.
  if (input.prayerClicksEnabled && world.prayers?.length && !viewFlags.hideUI) {
    const prayer = prayerAtPoint(world.prayers, input.mapX, input.mapY, { x: ox, y: oy }, TILE, zoom)
    if (prayer) return { kind: 'prayer', prayer }
  }

  const tx = Math.floor(worldX)
  const ty = Math.floor(worldY)

  if (viewFlags.territory) {
    const focusedLineage = focus.startsWith('lineage:') ? focus.slice('lineage:'.length) : null
    return {
      kind: 'territory',
      lineageId: lineageAtTerritoryTile(input.territoryIndex, tx, ty, focusedLineage),
    }
  }

  // The person drawn under the pointer wins; empty ground falls through to the nearest-person search.
  const drawnHit = input.pickPerson?.(input.mapX, input.mapY)
  if (drawnHit) return { kind: 'select', orgId: drawnHit }

  const nearest = nearestOrganism(world, worldX, worldY, zoom, input.coarsePointer)
  if (nearest && nearest.dist < 1.2) return { kind: 'select', orgId: nearest.id }

  const ruinedBuildingAtTile = hasRuinedBuildingAtWorldTile(world.buildings, tx, ty)
  const localCol = tx - ox
  const localRow = ty - oy
  const tileRow = world.grid?.tiles?.[localRow]
  const tileVal = tileRow ? tileRow[localCol] : undefined
  if (isWaterTile(tileVal) && (!nearest || nearest.dist >= 2.5)) return { kind: 'select', orgId: null }
  const isHut = tileVal === TILE_ID.HUT
  const structRow = world.grid?.structure?.[localRow]
  const structVal = (structRow && structRow[localCol]) || 0
  if (!ruinedBuildingAtTile && (isHut || structVal >= 0.35)) {
    let bestHost: { id: string; age: number } | null = null
    for (const org of world.organisms) {
      if (!org.alive) continue
      if (Math.floor(org.home_x) === tx && Math.floor(org.home_y) === ty) {
        if (!bestHost || org.age > bestHost.age) bestHost = { id: org.id, age: org.age }
      }
    }
    if (bestHost) return { kind: 'enter-home', orgId: bestHost.id }
  }
  return { kind: 'select', orgId: nearest ? nearest.id : null }
}

/**
 * The closest living person to a point, within reach: a tile and a bit,
 * wider on touch screens and when zoomed out. Someone inside 1.2 tiles is
 * clicked outright; the wider reach only keeps a nearby person from being
 * mistaken for open water or an empty hut.
 *
 * This is the one place that answers "who is under the cursor". When people
 * move onto a cubeforge SpriteLayer, replace the loop with `layer.pick()` and
 * keep the rest.
 */
export function nearestOrganism(
  world: WorldState,
  worldX: number,
  worldY: number,
  zoom: number,
  coarsePointer: boolean,
): { id: string; dist: number } | null {
  let nearest: { id: string; dist: number } | null = null
  let nearestDist = Math.min(5, Math.max(1.2, (coarsePointer ? 26 : 16) / (TILE * zoom)))
  for (const org of world.viewport_organisms?.length ? world.viewport_organisms : world.organisms) {
    if (!org.alive) continue
    const d = Math.hypot(org.x - worldX, org.y - worldY)
    if (d < nearestDist) {
      nearestDist = d
      nearest = { id: org.id, dist: d }
    }
  }
  return nearest
}
