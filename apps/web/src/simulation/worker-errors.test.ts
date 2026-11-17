import { afterEach, describe, expect, it } from 'vitest'
import { loadLocale } from '../i18n'
import { workerErrorText } from './worker-errors'

afterEach(async () => {
  await loadLocale('en')
})

describe('workerErrorText', () => {
  it('translates a known code and keeps the raw detail for bug reports', async () => {
    await loadLocale('de')
    expect(
      workerErrorText('autosave_failed', 'QuotaExceededError', 'autosave failed: QuotaExceededError'),
    ).toBe('Automatisches Speichern fehlgeschlagen: QuotaExceededError')
    expect(workerErrorText('locked_elsewhere', undefined, 'english')).toBe(
      'Diese Welt ist bereits in einem anderen Tab geöffnet; dieser Tab überschreibt ihren Spielstand nicht',
    )
  })

  it('reads in English by default', () => {
    expect(workerErrorText('sim_crashed', 'panicked at x', 'x')).toBe('the simulation crashed: panicked at x')
  })

  it('falls back to the worker message for an unknown or missing code', () => {
    expect(workerErrorText('something_new', 'd', 'raw message')).toBe('raw message')
    expect(workerErrorText(undefined, undefined, 'raw message')).toBe('raw message')
  })
})
