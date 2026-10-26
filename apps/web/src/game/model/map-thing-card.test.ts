import { afterEach, describe, expect, it } from 'vitest'
import type { Building, CaravanInfo, OrganismState, VehicleInfo, WorldState } from '../../shared/types'
import { loadLocale } from '../../i18n'
import { mapThingCard } from './map-thing-card'

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
