// Pixel-art building sprites. The painters live in ./building-painters, grouped by
// building family; this module is the stable import surface for the renderer.
export { PAD, PAD_BOT } from './building-painters/kit'
export { eraTier } from '../model/era-tier'
export { BUILDING_SPRITE_KINDS, hasBuildingSprite } from './building-painters/registry'
export { getBuildingSprite } from './building-painters/sprite'
