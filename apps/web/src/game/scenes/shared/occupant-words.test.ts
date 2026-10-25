import { afterEach, describe, expect, it } from 'vitest'
import { loadLocale } from '../../../i18n'
import { roleWord } from './occupant-words'

describe('roleWord', () => {
  afterEach(async () => {
    await loadLocale('en')
  })

  it('shows a role as its English word', () => {
    expect(roleWord('patron')).toBe('regular')
    expect(roleWord('host')).toBe('host')
  })

  it('shows a role in the active language', async () => {
    await loadLocale('de')
    expect(roleWord('patron')).toBe('Stammgast')
    expect(roleWord('worshipper')).toBe('Gläubige')
    expect(roleWord('priest')).toBe('Priester')
    await loadLocale('ru')
    expect(roleWord('brewer')).toBe('пивовар')
  })
})
