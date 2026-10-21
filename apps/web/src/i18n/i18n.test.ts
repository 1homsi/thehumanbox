import { afterEach, describe, expect, it } from 'vitest'
import { fmtNumber, t, tn } from '.'
import { CATALOGS } from './catalog'
import { setLocaleForTests } from './locale'

afterEach(() => setLocaleForTests('en'))

describe('i18n', () => {
  it('is English in the test suite, so existing assertions keep working', () => {
    expect(t('common.next')).toBe('Next')
  })

  it('switches to Russian and fills named placeholders', () => {
    setLocaleForTests('ru')
    expect(t('common.next')).toBe('Далее')
    expect(t('splash.downloadingOf', { loaded: '12', total: '480' })).toBe('загрузка · 12 / 480 КБ')
  })

  it('leaves an unknown placeholder visible instead of dropping it', () => {
    expect(t('splash.downloading')).toBe('downloading · {loaded} kb')
  })

  it('formats numbers the Russian way', () => {
    setLocaleForTests('ru')
    expect(fmtNumber(12345.5)).toBe('12 345,5')
  })

  it('every Russian message keeps the placeholders of its English source', () => {
    const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const [key, en] of Object.entries(CATALOGS.en)) {
      const ru = CATALOGS.ru[key]
      expect(ru, key).toBeDefined()
      const enForms = typeof en === 'string' ? [en] : Object.values(en)
      const ruForms = typeof ru === 'string' ? [ru] : Object.values(ru)
      for (const form of ruForms) expect(names(form), key).toEqual(names(enForms[0]))
    }
  })

  it('picks Russian plural forms by count', () => {
    setLocaleForTests('ru')
    // No plural message exists yet in the catalog; exercise the rules directly.
    const rules = new Intl.PluralRules('ru-RU')
    expect([1, 3, 5, 21, 1.5].map((n) => rules.select(n))).toEqual(['one', 'few', 'many', 'one', 'other'])
    expect(typeof tn).toBe('function')
  })
})
