import { afterEach, describe, expect, it } from 'vitest'
import { loadLocale } from '../../../i18n'
import type { WorldState } from '../../../shared/types'
import { resolveHomeScene } from './resolve'

const host = (over: Record<string, unknown>) => ({
  id: 'h',
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

// A stone-age household: the host's house stands on its tile with a finished wall.
const worldWith = (hostOver: Record<string, unknown>) => {
  const structure: number[][] = []
  structure[10] = []
  structure[10][10] = 1
  return {
    is_day: true,
    lineage_names: { L1: 'Ash' },
    lineage_eras: { L1: 'stone' },
    buildings: [],
    grid: { origin_x: 0, origin_y: 0, structure },
    organisms: [host(hostOver)],
  } as unknown as WorldState
}

describe('home scene text', () => {
  afterEach(async () => {
    await loadLocale('en')
  })

  it('words the title and the house line in English', () => {
    const ctx = resolveHomeScene(worldWith({}), { kind: 'home', orgId: 'h' })
    expect(ctx?.title).toBe("Ari's home")
    expect(ctx?.subtitle).toMatch(/^A stone-walled hut · Ash · /)
  })

  it('words the title and the house line in the active language', async () => {
    await loadLocale('de')
    const ctx = resolveHomeScene(worldWith({}), { kind: 'home', orgId: 'h' })
    expect(ctx?.title).toBe('Zuhause von Ari')
    expect(ctx?.subtitle).toMatch(/^Eine Hütte mit Steinmauern · Ash · /)
  })

  it('counts the pieces the household chose in the active language', async () => {
    await loadLocale('de')
    const one = resolveHomeScene(worldWith({ home_furniture: ['bench'] }), { kind: 'home', orgId: 'h' })
    expect(one?.subtitle).toMatch(/^Eine Hütte mit Steinmauern · 1 gewähltes Möbelstück · /)
    const two = resolveHomeScene(worldWith({ home_furniture: ['bench', 'rug'] }), {
      kind: 'home',
      orgId: 'h',
    })
    expect(two?.subtitle).toMatch(/^Eine Hütte mit Steinmauern · 2 gewählte Möbelstücke · /)
  })

  it('falls back to a plain home for an era it does not know', async () => {
    await loadLocale('de')
    const other = {
      ...worldWith({}),
      lineage_eras: { L1: 'dawn' },
    } as unknown as WorldState
    expect(resolveHomeScene(other, { kind: 'home', orgId: 'h' })?.subtitle).toMatch(/^Ein Zuhause · /)
  })
})
