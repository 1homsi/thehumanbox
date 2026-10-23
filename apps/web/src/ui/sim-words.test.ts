import { afterEach, describe, expect, it } from 'vitest'
import { loadLocale } from '../i18n'
import { buildingKindWord, moonPhaseWord, seasonWord } from './sim-words'

describe('words for the ids the simulation sends', () => {
  afterEach(async () => {
    await loadLocale('en')
  })

  it('shows a moon phase, season or building kind as its English words', () => {
    expect(moonPhaseWord('waxing_gibbous')).toBe('waxing gibbous')
    expect(seasonWord('abundance')).toBe('abundance')
    expect(buildingKindWord('market_stall')).toBe('market stall')
  })

  it('shows an id it does not know as its words, so a new id never breaks', () => {
    expect(buildingKindWord('fusion_plant')).toBe('fusion plant')
    expect(moonPhaseWord('blue_moon')).toBe('blue moon')
    expect(buildingKindWord('constructor')).toBe('constructor')
    expect(seasonWord(undefined)).toBe('')
    expect(moonPhaseWord(null)).toBe('')
  })

  it('translates a known id in the active language', async () => {
    await loadLocale('de')
    expect(buildingKindWord('hut')).toBe('Hütte')
    expect(moonPhaseWord('full_moon')).toBe('Vollmond')
    expect(seasonWord('recovery')).toBe('Erholung')
  })
})
