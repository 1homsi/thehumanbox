import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { getLocale, loadLocale, LOCALES, matchLocale, nativeName, t, type Messages } from './index'

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

  it('switches language and back', async () => {
    const other = LOCALES.find((code) => code !== 'en')
    if (!other) return
    expect(await loadLocale(other)).toBe(other)
    expect(t('settings.title')).not.toBe('')
    await loadLocale('en')
    expect(t('settings.title')).toBe('Settings')
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
