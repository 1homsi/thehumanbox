import { afterEach, describe, expect, it } from 'vitest'
import { loadLocale, t } from '../i18n'

// The sandbox status line in App.tsx is built from these phrases with the tool's name filled in.
describe('sandbox status phrases', () => {
  afterEach(async () => {
    await loadLocale('en')
  })

  it('keeps the English phrases as they were', () => {
    expect(t('header.sandbox.toolApplied', { tool: 'tribe' })).toBe('tribe applied')
    expect(t('header.sandbox.toolAt', { tool: 'tribe', x: 3, y: 4 })).toBe('tribe -> 3, 4')
    expect(t('header.sandbox.toolMapOn', { tool: 'heat' })).toBe('heat map on')
    expect(t('header.sandbox.noOnePraying')).toBe('no one is praying')
  })

  it('fills the tool name into the German phrases', async () => {
    await loadLocale('de')
    expect(t('header.sandbox.toolApplied', { tool: 'Stamm' })).toBe('Stamm angewendet')
    expect(t('header.sandbox.toolAt', { tool: 'Stamm', x: 3, y: 4 })).toBe('Stamm → 3, 4')
    expect(t('header.sandbox.noOnePraying')).toBe('niemand betet gerade')
  })
})
