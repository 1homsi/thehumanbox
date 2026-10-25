import { afterEach, describe, expect, it } from 'vitest'
import { loadLocale } from '../i18n'
import { discoveryWord } from './sim-words'

describe('words for the craft, material, measuring and other discoveries', () => {
  afterEach(async () => {
    await loadLocale('en')
  })

  it('keeps the English names of these discoveries', () => {
    expect(discoveryWord('stone_tools')).toBe('stone tools')
    expect(discoveryWord('cartography-deep')).toBe('cartography-deep')
  })

  it('names these discoveries in German', async () => {
    await loadLocale('de')
    expect(discoveryWord('stone_tools')).toBe('Steinwerkzeuge')
    expect(discoveryWord('pottery')).toBe('Töpferei')
    expect(discoveryWord('cartography-deep')).toBe('Vertiefte Kartografie')
  })

  it('names these discoveries in Russian', async () => {
    await loadLocale('ru')
    expect(discoveryWord('smelting')).toBe('плавка')
    expect(discoveryWord('lookout_post')).toBe('сторожевой пост')
  })
})
