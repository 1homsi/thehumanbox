import type { Building } from '../types'

const COMPLETE_THRESHOLD = 1
const VISIBLE_DAMAGE_THRESHOLD = 0.015

function unit(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value as number)) : fallback
}

export type BuildingVisualPhase =
  'construction' | 'intact' | 'damaged' | 'repairing' | 'ruined' | 'rebuilding'

export interface BuildingState {
  /** Existing construction progress. Never derived from structural damage. */
  constructionProgress: number
  integrity: number
  damage: number
  isComplete: boolean
  isDamaged: boolean
  isRuined: boolean
  isRepairing: boolean
  isOperational: boolean
  phase: BuildingVisualPhase
}

/**
 * Normalizes the building wire state without conflating `condition`
 * (construction progress) with post-construction structural damage.
 */
export function getBuildingState(
  building: Pick<Building, 'condition' | 'damage' | 'integrity' | 'ruined' | 'repairing'>,
): BuildingState {
  const constructionProgress = unit(building.condition, 1)
  const damage = unit(building.damage, 0)
  const integrity = unit(building.integrity, 1 - damage)
  const isComplete = constructionProgress >= COMPLETE_THRESHOLD
  const isRuined = building.ruined === true || damage >= 1 || integrity <= 0
  const isDamaged = isRuined || damage > VISIBLE_DAMAGE_THRESHOLD || integrity < 1 - VISIBLE_DAMAGE_THRESHOLD
  const isRepairing = building.repairing === true && isComplete && isDamaged
  const isOperational = isComplete && !isRuined

  let phase: BuildingVisualPhase
  if (isRuined) phase = isRepairing ? 'rebuilding' : 'ruined'
  else if (!isComplete) phase = 'construction'
  else if (isRepairing) phase = 'repairing'
  else if (isDamaged) phase = 'damaged'
  else phase = 'intact'

  return {
    constructionProgress,
    integrity,
    damage,
    isComplete,
    isDamaged,
    isRuined,
    isRepairing,
    isOperational,
    phase,
  }
}

export function isRuinedBuilding(building: Building): boolean {
  return getBuildingState(building).isRuined
}

export function buildingContainsWorldTile(building: Building, worldX: number, worldY: number): boolean {
  const footprint = building.footprint
  const width = Math.max(1, Math.floor(footprint?.[0] ?? building.fw ?? 1))
  const height = Math.max(1, Math.floor(footprint?.[1] ?? building.fh ?? 1))
  const left = Math.floor(building.x)
  const top = Math.floor(building.y)
  const tileX = Math.floor(worldX)
  const tileY = Math.floor(worldY)
  return tileX >= left && tileX < left + width && tileY >= top && tileY < top + height
}

export function findBuildingAtWorldTile(
  buildings: Building[] | undefined,
  worldX: number,
  worldY: number,
): Building | null {
  if (!buildings) return null
  for (let i = buildings.length - 1; i >= 0; i--) {
    const building = buildings[i]
    if (buildingContainsWorldTile(building, worldX, worldY)) return building
  }
  return null
}

export function hasRuinedBuildingAtWorldTile(
  buildings: Building[] | undefined,
  worldX: number,
  worldY: number,
): boolean {
  return (
    buildings?.some(
      (building) =>
        buildingContainsWorldTile(building, worldX, worldY) && getBuildingState(building).isRuined,
    ) ?? false
  )
}
