import type { Building, CaravanInfo, VehicleInfo, WorldState } from '../../shared/types'
import { t } from '../../i18n'
import { buildingKindWord, goodWord, vehicleKindWord } from '../../ui/sim-words'
import { getBuildingState, type BuildingState } from './building-state'
import type { MapThing } from './map-things'

/** A thing's card: its name, then a few plain lines about it. */
export interface ThingCard {
  title: string
  lines: string[]
}

/** Names shown on a card before the rest are counted. */
const NAMES_SHOWN = 3

/** The card for a thing on the map, read from the world as it is now; null when the thing is gone. */
export function mapThingCard(world: WorldState, thing: MapThing): ThingCard | null {
  if (thing.kind === 'building') {
    const building = world.buildings?.find((item) => item.id === thing.id)
    return building ? buildingCard(world, building) : null
  }
  if (thing.kind === 'vehicle') {
    const vehicle = world.vehicles?.find((item) => item.id === thing.id)
    return vehicle ? vehicleCard(world, vehicle) : null
  }
  const caravan = world.caravans?.find((item) => item.id === thing.id)
  return caravan ? caravanCard(world, caravan) : null
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

function capitalise(word: string): string {
  return word.charAt(0).toLocaleUpperCase() + word.slice(1)
}
