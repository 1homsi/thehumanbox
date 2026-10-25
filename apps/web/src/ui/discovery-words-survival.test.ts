import { afterEach, describe, expect, it } from 'vitest'
import { loadLocale } from '../i18n'
import { discoveryWord } from './sim-words'

describe('words for the gathering, hunting, animal, survival and hygiene discoveries', () => {
  afterEach(async () => {
    await loadLocale('en')
  })

  it('keeps the English names of these discoveries', () => {
    expect(discoveryWord('water_hygiene')).toBe('water hygiene')
    expect(discoveryWord('signal-fires')).toBe('signal-fires')
  })

  it('names these discoveries in German', async () => {
    await loadLocale('de')
    expect(discoveryWord('fire')).toBe('Feuer')
    expect(discoveryWord('water_hygiene')).toBe('Wasserhygiene')
    expect(discoveryWord('animal-taming')).toBe('Tierzähmung')
  })

  it('names these discoveries in Japanese', async () => {
    await loadLocale('ja')
    expect(discoveryWord('herding')).toBe('牧畜')
    expect(discoveryWord('berry-picking')).toBe('ベリー摘み')
  })
})
