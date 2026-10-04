// 2D building drawing. The footprint and colour tables, depth sorting, construction
// sites, ruins and the main painter live in ./building-draw; this module is the
// stable import surface for the renderer.
export { BUILDING_EMOJI, buildingEmoji } from './building-draw/emoji'
export { buildingFootprint, resolveBuildingFootprint } from './building-draw/footprints'
export type { BuildingLike, BuildingVisualDetail } from './building-draw/types'
export { buildingDepthKey, compareBuildingsByDepth, sortBuildingsByDepth } from './building-draw/depth'
export { RUIN_CRUMBLE_TICKS, ruinMaterial } from './building-draw/ruins'
export { drawBuilding } from './building-draw/draw'
