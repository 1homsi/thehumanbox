import type { Message } from './define'
import { CATALOGS, type MessageKey, type PluralKey } from './catalog'
import { getLocale, localeTag } from './locale'

export type { MessageKey, PluralKey } from './catalog'
export { applyDocumentLocale, getLocale, LOCALES, type Locale } from './locale'

export type Params = Record<string, string | number>

function lookup(key: string): Message | undefined {
  return CATALOGS[getLocale()][key] ?? CATALOGS.en[key]
}

function fill(text: string, params?: Params): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    if (value === undefined) return match
    return typeof value === 'number' ? fmtNumber(value) : value
  })
}

/** The interface text for a key, with {name} placeholders filled from params. */
export function t(key: MessageKey, params?: Params): string {
  const message = lookup(key)
  if (message === undefined) return key
  return fill(typeof message === 'string' ? message : message.other, params)
}

const pluralRules = new Map<string, Intl.PluralRules>()

function pluralCategory(n: number): Intl.LDMLPluralRule {
  const tag = localeTag()
  let rules = pluralRules.get(tag)
  if (!rules) {
    rules = new Intl.PluralRules(tag)
    pluralRules.set(tag, rules)
  }
  return rules.select(n)
}

/** A counted phrase in the right plural form ("1 человек", "3 человека", "5 человек"); {n} is the count. */
export function tn(key: PluralKey, n: number, params?: Params): string {
  const message = lookup(key)
  if (message === undefined) return key
  const forms = typeof message === 'string' ? { other: message } : message
  const category = pluralCategory(n)
  const text = forms[category as keyof typeof forms] ?? forms.other
  return fill(text, { n, ...params })
}

const numberFormats = new Map<string, Intl.NumberFormat>()

/** A number with the locale's digit grouping and decimal mark ("12 345,6" in Russian). */
export function fmtNumber(n: number, options?: Intl.NumberFormatOptions): string {
  const tag = localeTag()
  const cacheKey = options ? `${tag}:${JSON.stringify(options)}` : tag
  let format = numberFormats.get(cacheKey)
  if (!format) {
    format = new Intl.NumberFormat(tag, options)
    numberFormats.set(cacheKey, format)
  }
  return format.format(n)
}
