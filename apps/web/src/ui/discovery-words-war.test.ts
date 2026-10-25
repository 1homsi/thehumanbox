import { afterEach, describe, expect, it } from 'vitest'
import { loadLocale } from '../i18n'
import { discoveryWord } from './sim-words'

describe('words for the war, rule, diplomacy, trade and remedy discoveries', () => {
  afterEach(async () => {
    await loadLocale('en')
  })

  it('keeps the English names of these discoveries', () => {
    expect(discoveryWord('siege_breaking')).toBe('siege breaking')
    expect(discoveryWord('warband-deep')).toBe('warband-deep')
  })

  it('names these discoveries in German', async () => {
    await loadLocale('de')
    expect(discoveryWord('trade_route')).toBe('Handelsroute')
    expect(discoveryWord('diplomacy')).toBe('Diplomatie')
    expect(discoveryWord('conflict_resolution')).toBe('Konfliktlösung')
  })

  it('names these discoveries in Chinese', async () => {
    await loadLocale('zh-CN')
    expect(discoveryWord('truce')).toBe('停战')
    expect(discoveryWord('antidote')).toBe('解毒剂')
  })
})
