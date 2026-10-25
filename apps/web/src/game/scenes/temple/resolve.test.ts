import { afterEach, describe, expect, it } from 'vitest'
import { loadLocale } from '../../../i18n'
import type { WorldState } from '../../../shared/types'
import { resolveTempleScene } from './resolve'

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

const religion = { id: 'r1', name: 'Hearth', kind: 'Animism', founder_lineage: 'L1', adherents: 2 }

// A stone shrine of the Hearth faith with two of its people at the altar.
const worldWith = (faith: Record<string, unknown>) =>
  ({
    is_day: true,
    lineage_names: { L1: 'Ash' },
    buildings: [{ id: 2, kind: 'temple', x: 10, y: 10, condition: 1, owner_lineage: 'L1' }],
    religions: [{ ...religion, ...faith }],
    organisms: [
      org({ id: 'c', religion_id: 'r1', piety: 0.7 }),
      org({ id: 'd', religion_id: 'r1', piety: 0.4, x: 10, y: 11 }),
    ],
  }) as unknown as WorldState

const scene = { kind: 'temple' as const, religionId: 'r1' }

describe('temple scene text', () => {
  afterEach(async () => {
    await loadLocale('en')
  })

  it('words the subtitle in English and keeps the faith name', () => {
    const ctx = resolveTempleScene(worldWith({}), scene)
    expect(ctx?.title).toBe('Hearth')
    expect(ctx?.subtitle).toBe('a stone shrine to the spirits · 2 of the faith · 2 at the altar · 0 nearby')
  })

  it('words the subtitle in the active language', async () => {
    await loadLocale('de')
    expect(resolveTempleScene(worldWith({}), scene)?.subtitle).toBe(
      'ein Steinschrein für die Geister · 2 Gläubige · 2 am Altar · 0 in der Nähe',
    )
  })

  it('reads the kind in any letter case the simulation sends', async () => {
    await loadLocale('de')
    expect(resolveTempleScene(worldWith({ kind: 'monotheism' }), scene)?.subtitle).toMatch(
      /^ein geweihtes Haus des einen Gottes · /,
    )
  })

  it('falls back to a place of worship for a kind it does not know', async () => {
    await loadLocale('de')
    expect(resolveTempleScene(worldWith({ kind: 'Unknown' }), scene)?.subtitle).toMatch(
      /^ein Ort der Andacht · /,
    )
  })
})
