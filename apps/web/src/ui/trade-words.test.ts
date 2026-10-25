import { afterEach, describe, expect, it } from 'vitest'
import { loadLocale } from '../i18n'
import { goodWord, relationWord, treatyWord } from './sim-words'

describe('words for trade goods, treaty kinds and relation statuses', () => {
  afterEach(async () => {
    await loadLocale('en')
  })

  it('shows each one as its English words', () => {
    expect(goodWord('aged_spirit')).toBe('aged spirit')
    expect(treatyWord('non_aggression')).toBe('non aggression')
    expect(relationWord('rivals')).toBe('rivals')
  })

  it('shows a good, treaty or status the table does not name as its words', () => {
    expect(goodWord('new_good')).toBe('new good')
    expect(treatyWord('mutual_pact')).toBe('mutual pact')
    expect(relationWord('wary')).toBe('wary')
  })

  it('shows them in the active language', async () => {
    await loadLocale('de')
    expect(goodWord('food')).toBe('Nahrung')
    expect(treatyWord('non_aggression')).toBe('Nichtangriff')
    expect(relationWord('rivals')).toBe('Rivalen')
  })
})
