import { worldSprites } from './world'
import { controlsAndHazardSprites } from './controls-and-hazards'
import { farmAndPowerSprites } from './farm-and-powers'
import { creatureAndMarkerSprites } from './creatures-and-markers'
import { buildingSprites } from './buildings'
import { peopleSprites } from './people'

export { palette } from './palette'

export const sprites = {
  ...worldSprites,
  ...controlsAndHazardSprites,
  ...farmAndPowerSprites,
  ...creatureAndMarkerSprites,
  ...buildingSprites,
  ...peopleSprites,
}
