import { afterEach, describe, expect, it } from 'vitest'
import type {
  AnimalState,
  Building,
  CaravanInfo,
  OrganismState,
  VehicleInfo,
  WorldState,
} from '../../shared/types'
import { loadLocale } from '../../i18n'
import { groundLine, mapThingCard } from './map-thing-card'
import { TILE_ID } from './terrain-ids'

/** A 3x3 grid with water and a fire on its middle tile, which is deep (depth 100) and burning. */
function burningWaterGrid(): WorldState['grid'] {
  const tiles: number[][] = Array.from({ length: 3 }, () => [TILE_ID.GRASS, TILE_ID.GRASS, TILE_ID.GRASS])
  tiles[1][1] = TILE_ID.WATER
  const depth = Array.from({ length: 3 }, () => [255, 255, 255])
  depth[1][1] = 100
  const fire = Array.from({ length: 3 }, () => [0, 0, 0])
  fire[1][1] = 0.5
  return {
    width: 3,
    height: 3,
    origin_x: 0,
    origin_y: 0,
    tiles,
    depth_map: depth,
    fire_intensity: fire,
    fertility: Array.from({ length: 3 }, () => [0, 0, 0]),
    roads: Array.from({ length: 3 }, () => [0, 0, 0]),
    structure: Array.from({ length: 3 }, () => [0, 0, 0]),
  } as unknown as WorldState['grid']
}

describe('ground cards', () => {
  it('names the ground under a tile and its notes', () => {
    const w = world({ grid: burningWaterGrid() } as Partial<WorldState>)
    expect(mapThingCard(w, { kind: 'ground', x: 1, y: 1 })).toEqual({
      title: 'Deep water',
      lines: ['on fire'],
    })
  })

  it('gives the ground in one line for a tribe card, with its notes after it', () => {
    const w = world({ grid: burningWaterGrid() } as Partial<WorldState>)
    expect(groundLine(w, 1.5, 1.5)).toBe('deep water · on fire')
    expect(groundLine(w, 0.5, 0.5)).toBe('grass')
    expect(groundLine(w, 9.5, 9.5)).toBeNull()
  })

  it('is null when the ground is gone from the grid', () => {
    expect(
      mapThingCard(world({ grid: burningWaterGrid() } as Partial<WorldState>), {
        kind: 'ground',
        x: 7,
        y: 7,
      }),
    ).toBeNull()
  })
})

afterEach(async () => {
  await loadLocale('en')
})

function person(id: string, name: string, alive = true): OrganismState {
  return { id, name, alive, lineage_id: 'red' } as unknown as OrganismState
}

function world(extra: Partial<WorldState> = {}): WorldState {
  return {
    organisms: [
      person('a', 'Ada'),
      person('b', 'Bo'),
      person('c', 'Cy'),
      person('d', 'Di'),
      person('x', 'Old', false),
    ],
    lineage_names: { red: 'The Reds', blue: 'The Blues' },
    buildings: [],
    vehicles: [],
    caravans: [],
    ...extra,
  } as unknown as WorldState
}

function building(extra: Partial<Building>): Building {
  return { id: 1, kind: 'hut', x: 0, y: 0, condition: 1, damage: 0, integrity: 1, ...extra } as Building
}

describe('building cards', () => {
  it('names the kind, the owning tribe and that it is in good repair', () => {
    const w = world({ buildings: [building({ id: 1, kind: 'granary', owner_lineage: 'red' })] })
    expect(mapThingCard(w, { kind: 'building', id: 1 })).toEqual({
      title: 'Granary',
      lines: ['held by The Reds', 'in good repair'],
    })
  })

  it('says a building is being built, damaged, being repaired, in ruins or being rebuilt', () => {
    const lines = (extra: Partial<Building>) =>
      mapThingCard(world({ buildings: [building({ id: 2, kind: 'mill', ...extra })] }), {
        kind: 'building',
        id: 2,
      })?.lines

    expect(lines({ condition: 0.4 })).toEqual(['being built, 40% done'])
    expect(lines({ damage: 0.25, integrity: 0.75 })).toEqual(['damaged, 75% sound'])
    expect(lines({ damage: 0.25, integrity: 0.75, repairing: true })).toEqual(['being repaired'])
    expect(lines({ ruined: true, damage: 1, integrity: 0 })).toEqual(['in ruins'])
    expect(lines({ ruined: true, damage: 1, integrity: 0, repairing: true })).toEqual(['being rebuilt'])
  })

  it('shows a ruin as a ruin even when it was never finished', () => {
    const lines = (extra: Partial<Building>) =>
      mapThingCard(world({ buildings: [building({ id: 6, kind: 'mill', ...extra })] }), {
        kind: 'building',
        id: 6,
      })?.lines
    expect(lines({ condition: 0.4, ruined: true, damage: 1, integrity: 0 })).toEqual(['in ruins'])
  })

  it('names a person by the name the player gave them', () => {
    const named = { ...person('a', 'Ada'), custom_name: 'Mara' } as OrganismState
    const w = world({
      organisms: [named],
      buildings: [building({ id: 7, kind: 'house', function: 'Housing', occupants: ['a'] })],
    })
    expect(mapThingCard(w, { kind: 'building', id: 7 })?.lines).toEqual([
      'in good repair',
      'lives here: Mara',
    ])
  })

  it('names who lives in a house and who works in other buildings, the living only', () => {
    const occupants = ['a', 'b', 'x']
    const house = mapThingCard(
      world({ buildings: [building({ id: 3, kind: 'house', function: 'Housing', occupants })] }),
      { kind: 'building', id: 3 },
    )
    expect(house?.lines).toEqual(['in good repair', 'lives here: Ada, Bo'])

    const forge = mapThingCard(
      world({ buildings: [building({ id: 4, kind: 'forge', function: 'Industry', occupants })] }),
      { kind: 'building', id: 4 },
    )
    expect(forge?.lines).toEqual(['in good repair', 'works here: Ada, Bo'])
  })

  it('names three people and counts the rest', () => {
    const w = world({
      buildings: [building({ id: 5, kind: 'house', function: 'Housing', occupants: ['a', 'b', 'c', 'd'] })],
    })
    expect(mapThingCard(w, { kind: 'building', id: 5 })?.lines).toEqual([
      'in good repair',
      'lives here: Ada, Bo, Cy',
      'and 1 more',
    ])
  })

  it('names a grave by its kind and leaves out people when none are known', () => {
    const w = world({ buildings: [building({ id: 6, kind: 'gravestone' })] })
    expect(mapThingCard(w, { kind: 'building', id: 6 })).toEqual({
      title: 'Gravestone',
      lines: ['in good repair'],
    })
  })

  it('gives the building words in the active language', async () => {
    await loadLocale('de')
    const w = world({ buildings: [building({ id: 7, kind: 'hut', owner_lineage: 'red' })] })
    expect(mapThingCard(w, { kind: 'building', id: 7 })).toEqual({
      title: 'Hütte',
      lines: ['gehört The Reds', 'in gutem Zustand'],
    })
  })

  it('is null once the building is gone', () => {
    expect(mapThingCard(world(), { kind: 'building', id: 99 })).toBeNull()
  })
})

describe('vehicle cards', () => {
  const vehicle = (extra: Partial<VehicleInfo>): VehicleInfo => ({
    id: 1,
    kind: 'boat',
    x: 0,
    y: 0,
    ...extra,
  })

  it('names a boat by its kind, who is aboard, and whether it sails or is moored', () => {
    const w = world({
      vehicles: [vehicle({ id: 1, rider_id: 'a', passenger_ids: ['b'], sailing: true })],
    })
    expect(mapThingCard(w, { kind: 'vehicle', id: 1 })).toEqual({
      title: 'Boat',
      lines: ['aboard: Ada, Bo', 'under sail'],
    })
    const moored = world({ vehicles: [vehicle({ id: 2, kind: 'ship', harbour: [4, 4], cargo: 3 })] })
    expect(mapThingCard(moored, { kind: 'vehicle', id: 2 })).toEqual({
      title: 'Ship',
      lines: ['moored at harbour', 'carrying 3 goods'],
    })
  })

  it('names a train or cart with no one aboard as just its kind', () => {
    const w = world({ vehicles: [vehicle({ id: 3, kind: 'train' })] })
    expect(mapThingCard(w, { kind: 'vehicle', id: 3 })).toEqual({ title: 'Train', lines: [] })
  })

  it('drops people who are no longer alive from the list aboard', () => {
    const w = world({ vehicles: [vehicle({ id: 4, rider_id: 'x', passenger_ids: ['a'] })] })
    expect(mapThingCard(w, { kind: 'vehicle', id: 4 })?.lines).toEqual(['aboard: Ada'])
  })
})

describe('caravan cards', () => {
  it('says what a caravan carries and between which tribes it travels', () => {
    const caravan = {
      id: 8,
      route_id: 1,
      sender_lineage: 'red',
      receiver_lineage: 'blue',
      sender_org_id: 'a',
      cargo: 'salt',
      amount: 4,
      unit_price: 2,
      departed_tick: 0,
      arrives_tick: 10,
      from: [0, 0],
      to: [5, 5],
    } as unknown as CaravanInfo
    const w = world({ caravans: [caravan] })
    expect(mapThingCard(w, { kind: 'caravan', id: 8 })).toEqual({
      title: 'Caravan',
      lines: ['carrying 4 salt', 'from The Reds to The Blues'],
    })
    expect(mapThingCard(world(), { kind: 'caravan', id: 8 })).toBeNull()
  })
})

describe('animal cards', () => {
  const animal = (extra: Partial<AnimalState>): AnimalState =>
    ({ id: 1, kind: 'wolf', x: 0, y: 0, ...extra }) as AnimalState

  it('says what the animal is and whether it is wild or tame, hunting or hungry', () => {
    const w = world({ animals: [animal({ id: 1, hunting: true })] })
    expect(mapThingCard(w, { kind: 'animal', id: 1 })).toEqual({ title: 'Wolf', lines: ['wild', 'hunting'] })
    const hungry = world({ animals: [animal({ id: 2, kind: 'deer', hungry: true })] })
    expect(mapThingCard(hungry, { kind: 'animal', id: 2 })).toEqual({
      title: 'Deer',
      lines: ['wild', 'hungry'],
    })
  })

  it('names a tame animal, its name and whether it is young', () => {
    const w = world({
      animals: [animal({ id: 3, kind: 'dog', name: 'Argo', tame: true, young: true })],
    })
    expect(mapThingCard(w, { kind: 'animal', id: 3 })).toEqual({
      title: 'Dog',
      lines: ['named Argo', 'tame', 'young'],
    })
  })

  it('says a sleeping animal is asleep, not hunting, and uses the word for a two-word kind', () => {
    const w = world({ animals: [animal({ id: 4, kind: 'polar_bear', sleeping: true, hunting: true })] })
    expect(mapThingCard(w, { kind: 'animal', id: 4 })).toEqual({
      title: 'Polar bear',
      lines: ['wild', 'asleep'],
    })
  })

  it('reads the animals in view first', () => {
    const w = world({
      animals: [animal({ id: 5, kind: 'deer' })],
      viewport_animals: [animal({ id: 6, kind: 'rabbit' })],
    } as Partial<WorldState>)
    expect(mapThingCard(w, { kind: 'animal', id: 6 })?.title).toBe('Rabbit')
    expect(mapThingCard(w, { kind: 'animal', id: 5 })).toBeNull()
  })
})

describe('field, planting and tree cards', () => {
  it('names a field by its crop, its tribe and how far it has grown', () => {
    const farm = { id: 5, x: 1, y: 1, crop: 'wheat', lineage_id: 'red', planted_tick: 0, ready_tick: 100 }
    const at = (tick: number, extra: Record<string, unknown> = {}) =>
      mapThingCard(world({ tick, farms: [{ ...farm, ...extra }] } as Partial<WorldState>), {
        kind: 'farm',
        id: 5,
      })
    expect(at(50)).toEqual({ title: 'Wheat', lines: ['farmed by The Reds', 'growing'] })
    expect(at(150)).toEqual({ title: 'Wheat', lines: ['farmed by The Reds', 'ready'] })
    expect(at(150, { withered: true })).toEqual({ title: 'Wheat', lines: ['farmed by The Reds', 'withered'] })
    expect(at(150, { crop: undefined, lineage_id: undefined })).toEqual({ title: 'Field', lines: ['ready'] })
  })

  it('names a planting by its kind and says whether it is ripe', () => {
    const w = world({ plantings: [2, 3, 6, 4, 4, 4, 0, 1] } as Partial<WorldState>)
    expect(mapThingCard(w, { kind: 'planting', x: 2, y: 3 })).toEqual({ title: 'Oak', lines: ['ready'] })
    expect(mapThingCard(w, { kind: 'planting', x: 4, y: 4 })).toEqual({ title: 'Crop', lines: ['growing'] })
    expect(mapThingCard(w, { kind: 'planting', x: 9, y: 9 })).toBeNull()
  })

  it('names a tree by what it is', () => {
    const w = world()
    expect(mapThingCard(w, { kind: 'tree', x: 1, y: 1, tree: 'dead' })).toEqual({
      title: 'Dead tree',
      lines: [],
    })
    expect(mapThingCard(w, { kind: 'tree', x: 1, y: 1, tree: 'acacia' })).toEqual({
      title: 'Acacia',
      lines: [],
    })
  })
})
