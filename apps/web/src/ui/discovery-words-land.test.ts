import { afterEach, describe, expect, it } from 'vitest'
import { loadLocale } from '../i18n'
import { discoveryWord } from './sim-words'

describe('words for the land, water, road and weather discoveries', () => {
  afterEach(async () => {
    await loadLocale('en')
  })

  it('keeps the English names of these discoveries', () => {
    expect(discoveryWord('land_clearing')).toBe('land clearing')
    expect(discoveryWord('wind-lore')).toBe('wind-lore')
  })

  it('names these discoveries in German', async () => {
    await loadLocale('de')
    expect(discoveryWord('irrigation')).toBe('Bewässerung')
    expect(discoveryWord('paved-roads')).toBe('gepflasterte Straßen')
    expect(discoveryWord('meteorology')).toBe('Meteorologie')
  })

  it('names these discoveries in Japanese', async () => {
    await loadLocale('ja')
    expect(discoveryWord('forecasting')).toBe('予報')
    expect(discoveryWord('summit')).toBe('山頂')
  })
})
