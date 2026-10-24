import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  formatNumber,
  getLocale,
  loadLocale,
  LOCALES,
  matchLocale,
  nativeName,
  t,
  type Messages,
} from './index'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'locales')
const areaFiles = (code: string) => readdirSync(path.join(dir, code)).filter((file) => file.endsWith('.json'))
/** One language's area files merged under their area names, as the loader does. */
const read = (code: string): Messages =>
  Object.fromEntries(
    areaFiles(code).map((file) => [
      file.slice(0, -'.json'.length),
      JSON.parse(readFileSync(path.join(dir, code, file), 'utf8')) as Messages,
    ]),
  )
const english = read('en')
const translations = readdirSync(dir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'en')
  .map((entry) => entry.name)

/** Every leaf as `key -> text`; plural forms are listed as `key#form`. */
function leaves(table: Messages, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(table)) {
    const full = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.set(full, value)
    else if (typeof value.other === 'string') {
      for (const [form, text] of Object.entries(value)) out.set(`${full}#${form}`, String(text))
    } else for (const [k, v] of leaves(value, full)) out.set(k, v)
  }
  return out
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
const baseKey = (key: string) => key.split('#')[0]

describe('locale files', () => {
  const source = leaves(english)
  const sourceKeys = new Set([...source.keys()].map(baseKey))

  it('ship at least ten translations besides English', () => {
    expect(translations.length).toBeGreaterThanOrEqual(10)
  })

  for (const code of translations) {
    describe(code, () => {
      const table = leaves(read(code))

      it('is named by a language code the browser understands', () => {
        expect(() => new Intl.Locale(code)).not.toThrow()
        expect(nativeName(code)).not.toBe('')
      })

      it('has the same area files as English', () => {
        expect(areaFiles(code).sort()).toEqual(areaFiles('en').sort())
      })

      it('translates every English key and adds none', () => {
        const keys = new Set([...table.keys()].map(baseKey))
        expect([...sourceKeys].filter((k) => !keys.has(k))).toEqual([])
        expect([...keys].filter((k) => !sourceKeys.has(k))).toEqual([])
      })

      it('keeps every placeholder', () => {
        const wrong: string[] = []
        for (const [key, text] of table) {
          const english = source.get(key) ?? source.get(`${baseKey(key)}#other`)
          if (english === undefined) continue
          if (placeholders(text).join() !== placeholders(english).join()) wrong.push(key)
        }
        expect(wrong).toEqual([])
      })

      it('leaves nothing empty', () => {
        expect([...table].filter(([, text]) => text.trim() === '').map(([key]) => key)).toEqual([])
      })
    })
  }
})

describe('t', () => {
  afterEach(async () => {
    await loadLocale('en')
  })

  it('fills placeholders and leaves unknown ones alone', () => {
    expect(t('header.tick', { tick: '1,200' })).toBe('tick 1,200')
    expect(t('header.tick')).toBe('tick {tick}')
  })

  it('falls back to English for a language it cannot load', async () => {
    expect(await loadLocale('xx')).toBe('en')
    expect(getLocale()).toBe('en')
    expect(t('settings.title')).toBe('Settings')
  })

  it('lets the latest load win when two overlap', async () => {
    const [first, second] = LOCALES.filter((code) => code !== 'en')
    await Promise.all([loadLocale(first), loadLocale(second)])
    expect(getLocale()).toBe(second)
  })

  it('a start-up that finished in time does not cancel a later load', async () => {
    const other = LOCALES.find((code) => code !== 'en')
    if (!other) return
    const { initI18n } = await import('./index')
    await initI18n(5)
    const later = loadLocale(other)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(await later).toBe(other)
    expect(getLocale()).toBe(other)
  })

  it('switches language and back', async () => {
    const other = LOCALES.find((code) => code !== 'en')
    if (!other) return
    expect(await loadLocale(other)).toBe(other)
    expect(t('settings.title')).not.toBe('')
    await loadLocale('en')
    expect(t('settings.title')).toBe('Settings')
  })
})

describe('formatNumber', () => {
  it('shows a dash for a missing or broken number instead of throwing', () => {
    expect(formatNumber(1234)).toBe('1,234')
    expect(formatNumber(undefined)).toBe('–')
    expect(formatNumber(null)).toBe('–')
    expect(formatNumber(Number.NaN)).toBe('–')
  })
})

describe('plural forms', () => {
  afterEach(async () => {
    await loadLocale('en')
  })

  // Callers pass the count already formatted with formatNumber ("1,021" in English), and the plural
  // must still come from the number that text stands for. Russian's "one" form covers 1, 21, 1,021.
  it('picks the plural form of a formatted count, not of its text', async () => {
    await loadLocale('ru')
    expect(t('dialogs.civ.trade.routes', { count: formatNumber(1021) })).toBe(`${formatNumber(1021)} маршрут`)
    expect(t('dialogs.civ.trade.routes', { count: formatNumber(1022) })).toBe(
      `${formatNumber(1022)} маршрута`,
    )
    expect(t('dialogs.civ.trade.routes', { count: formatNumber(5005) })).toBe(
      `${formatNumber(5005)} маршрутов`,
    )
    expect(t('dialogs.civ.trade.routes', { count: formatNumber(3) })).toBe('3 маршрута')
  })

  it('reads a count written with another language grouping mark', async () => {
    await loadLocale('de')
    expect(formatNumber(1021)).toContain('.')
    expect(t('dialogs.civ.trade.routes', { count: formatNumber(1021) })).toBe(`${formatNumber(1021)} Routen`)
    expect(t('dialogs.civ.trade.routes', { count: formatNumber(1) })).toBe('1 Route')
  })

  it('keeps the plural of a plain number', async () => {
    await loadLocale('ru')
    expect(t('dialogs.civ.trade.routes', { count: 1021 })).toBe('1021 маршрут')
  })
})

describe('matchLocale', () => {
  const available = ['en', 'es', 'pt-BR', 'zh-CN']

  it('prefers an exact tag, then the same language', () => {
    expect(matchLocale(['pt-BR'], available)).toBe('pt-BR')
    expect(matchLocale(['pt-PT'], available)).toBe('pt-BR')
    expect(matchLocale(['es-MX', 'en'], available)).toBe('es')
    expect(matchLocale(['zh'], available)).toBe('zh-CN')
  })

  it('returns null when nothing matches', () => {
    expect(matchLocale(['nl', 'sv'], available)).toBeNull()
  })
})
