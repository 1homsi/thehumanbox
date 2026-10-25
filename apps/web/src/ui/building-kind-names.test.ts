import { afterEach, describe, expect, it } from 'vitest'
import { loadLocale } from '../i18n'
import { buildingKindWord, discoveryWord } from './sim-words'

describe('words for the building kinds the simulation builds', () => {
  afterEach(async () => {
    await loadLocale('en')
  })

  it('keeps the English words of a kind the table did not name before', () => {
    expect(buildingKindWord('fusion_plant')).toBe('fusion plant')
    expect(buildingKindWord('clock_tower')).toBe('clock tower')
  })

  it('names a building kind in the active language', async () => {
    await loadLocale('de')
    expect(buildingKindWord('ai_core')).toBe('KI-Kern')
    expect(buildingKindWord('train_station')).toBe('Bahnhof')
    await loadLocale('ru')
    expect(buildingKindWord('clock_tower')).toBe('башня с часами')
  })

  it('names a finished building in the discovery list as its kind', async () => {
    await loadLocale('ja')
    expect(discoveryWord('mushroom_farm')).toBe('キノコ農場')
  })

  it('still shows an unknown discovery as its words', async () => {
    await loadLocale('ja')
    expect(discoveryWord('made_up_building')).toBe('made up building')
  })
})
