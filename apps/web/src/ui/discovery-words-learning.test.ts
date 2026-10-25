import { afterEach, describe, expect, it } from 'vitest'
import { loadLocale } from '../i18n'
import { discoveryWord } from './sim-words'

describe('words for the learning, writing, science and record-keeping discoveries', () => {
  afterEach(async () => {
    await loadLocale('en')
  })

  it('keeps the English names of these discoveries', () => {
    expect(discoveryWord('scroll_copying')).toBe('scroll copying')
    expect(discoveryWord('critical_thinking')).toBe('critical thinking')
  })

  it('names these discoveries in German', async () => {
    await loadLocale('de')
    expect(discoveryWord('scroll_copying')).toBe('Schriftrolle abschreiben')
    expect(discoveryWord('mathematics')).toBe('Mathematik')
    expect(discoveryWord('writing_system')).toBe('Schriftsystem')
  })

  it('names these discoveries in Turkish', async () => {
    await loadLocale('tr')
    expect(discoveryWord('astronomy')).toBe('astronomi')
    expect(discoveryWord('eclipse_prediction')).toBe('tutulma tahmini')
  })
})
