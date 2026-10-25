import { afterEach, describe, expect, it } from 'vitest'
import { loadLocale, t } from '../i18n'
import { factsLine } from '../game/model/lineage-facts'
import { eraWord } from './era-words'

describe('eraWord', () => {
  afterEach(async () => {
    await loadLocale('en')
  })

  it('shows an era as its English name, with the simulation id written either way', () => {
    expect(eraWord('stone')).toBe('stone')
    expect(eraWord('pre-stone')).toBe('pre stone')
    expect(eraWord('pre_stone')).toBe('pre stone')
    expect(eraWord(null)).toBe('')
  })

  it('shows an era it does not know as its words', () => {
    expect(eraWord('dawn_of_time')).toBe('dawn of time')
  })

  it('shows an era in the active language, wrapped in that language’s age phrase', async () => {
    await loadLocale('de')
    expect(eraWord('stone')).toBe('Stein')
    expect(t('panels.tribe.eraAge', { era: eraWord('bronze') })).toBe('Zeitalter Bronze')
    await loadLocale('ja')
    expect(t('panels.tribe.eraAge', { era: eraWord('information') })).toBe('情報の時代')
  })

  it('words the age on the lineage list in the active language', async () => {
    await loadLocale('de')
    expect(factsLine({ era: eraWord('stone'), government: 'Rat' })).toBe('Zeitalter Stein · Rat')
  })
})
