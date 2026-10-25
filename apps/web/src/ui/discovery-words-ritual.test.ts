import { afterEach, describe, expect, it } from 'vitest'
import { loadLocale } from '../i18n'
import { discoveryWord } from './sim-words'

describe('words for the faith, ceremony, rite and custom discoveries', () => {
  afterEach(async () => {
    await loadLocale('en')
  })

  it('keeps the English names of these discoveries', () => {
    expect(discoveryWord('rites_of_passage')).toBe('rites of passage')
    expect(discoveryWord('totem-pole')).toBe('totem-pole')
  })

  it('names these discoveries in German', async () => {
    await loadLocale('de')
    expect(discoveryWord('faith')).toBe('Glaube')
    expect(discoveryWord('tomb_preparation')).toBe('Grabbereitung')
    expect(discoveryWord('wedding')).toBe('Hochzeit')
  })

  it('names these discoveries in Polish', async () => {
    await loadLocale('pl')
    expect(discoveryWord('priesthood')).toBe('kapłaństwo')
    expect(discoveryWord('new_year')).toBe('nowy rok')
  })
})
