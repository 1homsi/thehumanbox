import type {
  AnimalState,
  Building,
  CaravanInfo,
  FarmInfo,
  VehicleInfo,
  WorldState,
} from '../../shared/types'
import { t, type MessageKey } from '../../i18n'
import { animalKindWord, buildingKindWord, cropWord, goodWord, vehicleKindWord } from '../../ui/sim-words'
import { PLANT_KIND } from '../render/plantings'
import { getBuildingState, type BuildingState } from './building-state'
import { farmStage, type FarmStage } from './farms'
import { animalsInView, type MapThing, type TreeKind } from './map-things'
import { terrainAt, type GroundKey, type GroundNote } from './map-terrain'

/** A thing's card: its name, then a few plain lines about it. */
export interface ThingCard {
  title: string
  lines: string[]
}

/** Names shown on a card before the rest are counted. */
const NAMES_SHOWN = 3

/** The card for a thing on the map, read from the world as it is now; null when the thing is gone. */
export function mapThingCard(world: WorldState, thing: MapThing): ThingCard | null {
  switch (thing.kind) {
    case 'animal': {
      const animal = animalsInView(world).find((item) => item.id === thing.id)
      return animal ? animalCard(animal) : null
    }
    case 'building': {
      const building = world.buildings?.find((item) => item.id === thing.id)
      return building ? buildingCard(world, building) : null
    }
    case 'vehicle': {
      const vehicle = world.vehicles?.find((item) => item.id === thing.id)
      return vehicle ? vehicleCard(world, vehicle) : null
    }
    case 'caravan': {
      const caravan = world.caravans?.find((item) => item.id === thing.id)
      return caravan ? caravanCard(world, caravan) : null
    }
    case 'farm': {
      const farm = world.farms?.find((item) => item.id === thing.id)
      return farm ? farmCard(world, farm) : null
    }
    case 'planting':
      return plantingCard(world, thing.x, thing.y)
    case 'tree':
      return { title: capitalise(t(TREE_WORDS[thing.tree])), lines: [] }
    case 'ground': {
      const facts = terrainAt(world, thing.x + 0.5, thing.y + 0.5)
      return facts
        ? {
            title: capitalise(t(GROUND_WORDS[facts.ground])),
            lines: facts.notes.map((note) => t(NOTE_WORDS[note])),
          }
        : null
    }
  }
}

/**
 * The ground under a world point in one line for a tribe's card, for example "shallow water · on fire".
 * Null off the grid.
 */
export function groundLine(world: WorldState, worldX: number, worldY: number): string | null {
  const facts = terrainAt(world, worldX, worldY)
  if (!facts) return null
  return [t(GROUND_WORDS[facts.ground]), ...facts.notes.map((note) => t(NOTE_WORDS[note]))].join(' · ')
}

const GROUND_WORDS: Record<GroundKey, MessageKey> = {
  grass: 'model.terrain.ground.grass',
  shallowWater: 'model.terrain.ground.shallowWater',
  deepWater: 'model.terrain.ground.deepWater',
  floodwater: 'model.terrain.ground.floodwater',
  sand: 'model.terrain.ground.sand',
  snow: 'model.terrain.ground.snow',
  ice: 'model.terrain.ground.ice',
  rock: 'model.terrain.ground.rock',
  ash: 'model.terrain.ground.ash',
  scorched: 'model.terrain.ground.scorched',
  lava: 'model.terrain.ground.lava',
  mineral: 'model.terrain.ground.mineral',
  foodGround: 'model.terrain.ground.foodGround',
  fire: 'model.terrain.ground.fire',
  campfire: 'model.terrain.ground.campfire',
}

const NOTE_WORDS: Record<GroundNote, MessageKey> = {
  track: 'model.terrain.note.track',
  rail: 'model.terrain.note.rail',
  canal: 'model.terrain.note.canal',
  bridge: 'model.terrain.note.bridge',
  fertile: 'model.terrain.note.fertile',
  onFire: 'model.terrain.note.onFire',
}

function animalCard(animal: AnimalState): ThingCard {
  const lines: string[] = []
  if (animal.name) lines.push(t('model.thing.animal.named', { name: animal.name }))
  lines.push(t(animal.tame ? 'model.thing.animal.tame' : 'model.thing.animal.wild'))
  if (animal.young) lines.push(t('model.thing.animal.young'))
  if (animal.sleeping) lines.push(t('model.thing.animal.asleep'))
  else if (animal.hunting) lines.push(t('model.thing.animal.hunting'))
  else if (animal.hungry) lines.push(t('model.thing.animal.hungry'))
  return { title: capitalise(animalKindWord(animal.kind)), lines }
}

function buildingCard(world: WorldState, building: Building): ThingCard {
  const state = getBuildingState(building)
  const lines: string[] = []
  const owner = building.owner_lineage ?? building.lineage_id
  const tribe = owner ? world.lineage_names?.[owner] : undefined
  if (tribe) lines.push(t('model.thing.building.tribe', { tribe }))
  lines.push(buildingStateLine(state))
  const people = peopleIn(world, building)
  if (people.names) {
    const key = building.function === 'Housing' ? 'model.thing.building.lives' : 'model.thing.building.works'
    lines.push(t(key, { names: people.names }))
    if (people.more > 0) lines.push(t('model.thing.building.more', { count: people.more }))
  }
  return { title: capitalise(buildingKindWord(building.kind)), lines }
}

function buildingStateLine(state: BuildingState): string {
  if (!state.isComplete)
    return t('model.thing.building.construction', { percent: Math.round(state.constructionProgress * 100) })
  if (state.isRuined)
    return t(state.isRepairing ? 'model.thing.building.rebuilding' : 'model.thing.building.ruined')
  if (state.isRepairing) return t('model.thing.building.repairing')
  if (state.isDamaged)
    return t('model.thing.building.damaged', { percent: Math.round(state.integrity * 100) })
  return t('model.thing.building.intact')
}

/** The living people a building holds, as the first few names and how many more there are. */
function peopleIn(world: WorldState, building: Building): { names: string; more: number } {
  const living: string[] = []
  for (const id of building.occupants ?? []) {
    const person = world.organisms.find((org) => org.id === id && org.alive)
    if (person) living.push(person.name)
  }
  return {
    names: living.slice(0, NAMES_SHOWN).join(', '),
    more: Math.max(0, living.length - NAMES_SHOWN),
  }
}

function vehicleCard(world: WorldState, vehicle: VehicleInfo): ThingCard {
  const lines: string[] = []
  const aboard = [vehicle.rider_id, ...(vehicle.passenger_ids ?? [])]
    .filter((id): id is string => !!id)
    .map((id) => world.organisms.find((org) => org.id === id && org.alive)?.name)
    .filter((name): name is string => !!name)
  if (aboard.length > 0)
    lines.push(t('model.thing.vehicle.aboard', { names: aboard.slice(0, NAMES_SHOWN).join(', ') }))
  if (vehicle.building) lines.push(t('model.thing.vehicle.building'))
  else if (vehicle.sailing) lines.push(t('model.thing.vehicle.sailing'))
  else if (vehicle.harbour) lines.push(t('model.thing.vehicle.moored'))
  if (vehicle.cargo && vehicle.cargo > 0) lines.push(t('model.thing.vehicle.cargo', { count: vehicle.cargo }))
  return { title: capitalise(vehicleKindWord(vehicle.kind)), lines }
}

function caravanCard(world: WorldState, caravan: CaravanInfo): ThingCard {
  const name = (lineage: string) => world.lineage_names?.[lineage] ?? lineage
  return {
    title: capitalise(t('model.thing.caravan.title')),
    lines: [
      t('model.thing.caravan.load', { amount: caravan.amount, cargo: goodWord(caravan.cargo) }),
      t('model.thing.caravan.route', {
        from: name(caravan.sender_lineage),
        to: name(caravan.receiver_lineage),
      }),
    ],
  }
}

function farmCard(world: WorldState, farm: FarmInfo): ThingCard {
  const lines: string[] = []
  const tribe = farm.lineage_id ? world.lineage_names?.[farm.lineage_id] : undefined
  if (tribe) lines.push(t('model.thing.farm.tribe', { tribe }))
  lines.push(t(farm.withered ? 'model.thing.stage.withered' : STAGE_WORDS[farmStage(farm, world.tick)]))
  const title = farm.crop ? capitalise(cropWord(farm.crop)) : capitalise(t('model.thing.farm.field'))
  return { title, lines }
}

/** The stage of a farm plot, in words. A plot that is fallow has nothing sown. */
const STAGE_WORDS: Record<FarmStage, MessageKey> = {
  fallow: 'model.thing.stage.fallow',
  seeded: 'model.thing.stage.sown',
  growing: 'model.thing.stage.growing',
  mature: 'model.thing.stage.ready',
  harvested: 'model.thing.stage.fallow',
}

/** A planting the player made: its kind, and whether it is ripe. Stage 4 is ripe; 0 to 3 are growing. */
function plantingCard(world: WorldState, x: number, y: number): ThingCard | null {
  const flat = world.plantings ?? []
  for (let i = 0; i + 3 < flat.length; i += 4) {
    if (flat[i] !== x || flat[i + 1] !== y) continue
    const kind = flat[i + 2] ?? -1
    const stage = flat[i + 3] ?? 0
    const word = PLANTING_WORDS[kind]
    if (!word) return null
    return {
      title: capitalise(t(word)),
      lines: [t(stage >= 4 ? 'model.thing.stage.ready' : 'model.thing.stage.growing')],
    }
  }
  return null
}

const PLANTING_WORDS: Record<number, MessageKey> = {
  [PLANT_KIND.CROP]: 'model.words.plant.crop',
  [PLANT_KIND.ORCHARD]: 'model.words.plant.orchard',
  [PLANT_KIND.SAPLING]: 'model.words.plant.sapling',
  [PLANT_KIND.FLOWER]: 'model.words.plant.flower',
  [PLANT_KIND.BERRY]: 'model.words.plant.berry',
  [PLANT_KIND.MUSHROOM]: 'model.words.plant.mushroom',
  [PLANT_KIND.OAK]: 'model.words.plant.oak',
  [PLANT_KIND.PINE]: 'model.words.plant.pine',
  [PLANT_KIND.PALM]: 'model.words.plant.palm',
}

const TREE_WORDS: Record<TreeKind, MessageKey> = {
  tree: 'model.words.plant.tree',
  conifer: 'model.words.plant.conifer',
  bush: 'model.words.plant.bush',
  dead: 'model.words.plant.deadTree',
  cactus: 'model.words.plant.cactus',
  acacia: 'model.words.plant.acacia',
}

function capitalise(word: string): string {
  return word.charAt(0).toLocaleUpperCase() + word.slice(1)
}
