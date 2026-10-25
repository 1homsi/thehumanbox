import { afterEach, describe, expect, it } from 'vitest'
import { loadLocale } from '../../i18n'
import type { OrganismState, WorldState } from '../../shared/types'
import { resolveForgeScene } from './forge/resolve'
import { resolveSettlementScene } from './settlement/resolve'
import { resolveTavernScene } from './tavern/resolve'
import { resolveTempleScene } from './temple/resolve'
import { householdAround } from './shared/occupants'

// Minimal world records: only the fields the resolvers read.
const org = (over: Record<string, unknown>) => ({
  id: 'x',
  name: 'Ari',
  alive: true,
  lineage_id: 'L1',
  x: 10,
  y: 10,
  home_x: 10,
  home_y: 10,
  age_stage: 'adult',
  tools: {},
  discoveries: [],
  thought: '',
  is_leader: false,
  ...over,
})

const world = (over: Record<string, unknown>) =>
  ({
    is_day: true,
    lineage_names: { L1: 'Ash' },
    buildings: [],
    religions: [],
    organisms: [],
    ...over,
  }) as unknown as WorldState

describe('scene activity lines in the active language', () => {
  afterEach(async () => {
    await loadLocale('en')
  })

  it('words what the tavern drinkers are doing', async () => {
    const w = world({
      buildings: [{ id: 1, kind: 'Tavern', x: 10, y: 10, condition: 1, owner_lineage: 'L1' }],
      organisms: [org({ id: 'a', tools: { spirit: 1 } }), org({ id: 'b', x: 11, discoveries: ['brewing'] })],
    })
    expect(
      resolveTavernScene(w, { kind: 'tavern', lineageId: 'L1' })?.occupants.map((o) => o.activity),
    ).toEqual(['serving', 'drinking'])
    await loadLocale('de')
    expect(
      resolveTavernScene(w, { kind: 'tavern', lineageId: 'L1' })?.occupants.map((o) => o.activity),
    ).toEqual(['bedient', 'trinkt'])
  })

  it('keeps a thought the simulation wrote, in any language', async () => {
    await loadLocale('de')
    const w = world({
      buildings: [{ id: 1, kind: 'Tavern', x: 10, y: 10, condition: 1, owner_lineage: 'L1' }],
      organisms: [org({ id: 'a', thought: 'toast to the harvest' })],
    })
    expect(resolveTavernScene(w, { kind: 'tavern', lineageId: 'L1' })?.occupants[0].activity).toBe(
      'toast to the harvest',
    )
  })

  it('words what the worshippers are doing', async () => {
    const w = world({
      religions: [{ id: 'r1', name: 'Hearth', kind: 'Animism', founder_lineage: 'L1', adherents: 2 }],
      buildings: [{ id: 2, kind: 'temple', x: 10, y: 10, condition: 1, owner_lineage: 'L1' }],
      organisms: [
        org({ id: 'c', religion_id: 'r1', piety: 0.7 }),
        org({ id: 'd', religion_id: 'r1', piety: 0.4, x: 10, y: 11 }),
      ],
    })
    await loadLocale('de')
    expect(
      resolveTempleScene(w, { kind: 'temple', religionId: 'r1' })?.occupants.map((o) => o.activity),
    ).toEqual(['betet', 'denkt nach'])
  })

  it('words the worker at the forge', async () => {
    await loadLocale('de')
    const w = world({
      buildings: [{ id: 3, kind: 'Forge', x: 10, y: 10, condition: 1, owner_lineage: 'L1' }],
      organisms: [org({ id: 'e', specialty: 'smith' })],
    })
    expect(resolveForgeScene(w, { kind: 'forge', buildingId: 3 })?.occupants[0].activity).toBe(
      'arbeitet an der Schmiede',
    )
  })

  it('words an idle villager in the square', async () => {
    await loadLocale('de')
    const w = world({ organisms: [org({ id: 'f' })] })
    expect(
      resolveSettlementScene(w, { kind: 'settlement', centerX: 10, centerY: 10, lineageId: 'L1' })
        ?.occupants[0].activity,
    ).toBe('untätig')
  })

  it('words the host who is at home', async () => {
    await loadLocale('de')
    const structure: number[][] = []
    structure[10] = []
    structure[10][10] = 1
    const host = org({ id: 'g' })
    const w = world({
      grid: { origin_x: 0, origin_y: 0, structure },
      organisms: [host],
    })
    expect(householdAround(w, host as unknown as OrganismState).inside[0].activity).toBe('zu Hause')
  })
})
