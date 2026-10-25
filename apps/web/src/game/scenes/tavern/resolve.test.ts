import { afterEach, describe, expect, it } from 'vitest'
import { formatNumber, loadLocale, t } from '../../../i18n'
import type { WorldState } from '../../../shared/types'
import { resolveTavernScene } from './resolve'

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

// One tavern with two drinkers next to it, one of whom knows brewing and one of whom has spirit on the shelf.
const world = {
  is_day: true,
  lineage_names: { L1: 'Ash' },
  buildings: [{ id: 1, kind: 'Tavern', x: 10, y: 10, condition: 1, owner_lineage: 'L1' }],
  religions: [],
  organisms: [org({ id: 'a', tools: { spirit: 1 } }), org({ id: 'b', x: 11, discoveries: ['brewing'] })],
} as unknown as WorldState

const scene = { kind: 'tavern' as const, lineageId: 'L1' }

describe('tavern scene text', () => {
  afterEach(async () => {
    await loadLocale('en')
  })

  it('words the title and the subtitle in English', () => {
    const ctx = resolveTavernScene(world, scene)
    expect(ctx?.title).toBe('Ash tavern')
    expect(ctx?.subtitle).toBe('2 drinking · 0 nearby · quiet daytime hours · 1 brewer · 1 on the shelf')
  })

  it('words the title and the subtitle in the active language', async () => {
    await loadLocale('de')
    const ctx = resolveTavernScene(world, scene)
    expect(ctx?.title).toBe('Taverne von Ash')
    expect(ctx?.subtitle).toBe('2 trinken · 0 in der Nähe · ruhige Tagesstunden · 1 Brauer · 1 im Regal')
  })

  it('picks the plural form of a brewer count in Russian', async () => {
    await loadLocale('ru')
    expect(t('panels.scene.tavern.brewers', { count: formatNumber(5) })).toBe('5 пивоваров')
    expect(t('panels.scene.tavern.brewers', { count: formatNumber(2) })).toBe('2 пивовара')
    expect(t('panels.scene.tavern.brewers', { count: formatNumber(1) })).toBe('1 пивовар')
  })
})
