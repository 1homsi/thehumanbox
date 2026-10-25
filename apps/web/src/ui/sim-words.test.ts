import { afterEach, describe, expect, it } from 'vitest'
import { loadLocale } from '../i18n'
import { buildingKindWord, discoveryWord, moonPhaseWord, seasonWord } from './sim-words'

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
    expect(buildingKindWord('fusion_reactor_x')).toBe('fusion reactor x')
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

describe('words for the discoveries the simulation records', () => {
  afterEach(async () => {
    await loadLocale('en')
  })

  it('shows a discovery as its words, with underscores turned into spaces', () => {
    expect(discoveryWord('stone_tools')).toBe('stone tools')
    expect(discoveryWord('harvest-festival')).toBe('harvest-festival')
  })

  it('shows a discovery in the active language', async () => {
    await loadLocale('de')
    expect(discoveryWord('agriculture')).toBe('Ackerbau')
    await loadLocale('ja')
    expect(discoveryWord('brewing')).toBe('醸造')
  })

  it('shows a discovery it does not name as its words in every language', async () => {
    await loadLocale('de')
    expect(discoveryWord('made_up_discovery')).toBe('made up discovery')
  })
})
